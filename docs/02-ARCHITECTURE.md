# 02 — Архитектура

## Общая схема

```
┌──────────────────────────── 1 сервер / Docker Compose ────────────────────────────┐
│                                                                                    │
│  Next.js (web) ──HTTP──▶ NestJS+Fastify (api) ──┬──▶ PostgreSQL (users, chats,     │
│   чат + админка              auth, RBAC,        │      documents, audit, analytics)│
│                              chat, documents,   ├──▶ Redis (кэш ответов, sessions) │
│                              analytics          ├──▶ BullMQ (очередь ингестии)     │
│                                                 ├──▶ Qdrant (векторы + payload)    │
│                                                 ├──▶ S3/MinIO (оригиналы файлов)   │
│                                                 └──▶ ingest (Python FastAPI):      │
│                                                        Docling, chunking,          │
│                                                        embeddings, BM25 build      │
│  Внешние API: OpenAI (embeddings, LLM) / Anthropic (LLM)                           │
│  Self-hosted: bge-reranker-v2-m3 (CPU, ONNX) внутри ingest-сервиса                 │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Почему так

- **До 100 документов, ≤1000 пользователей** → один сервер достаточен. Qdrant в
  Docker с квантованием — сотни МБ RAM. Reranker на CPU: top-20 пар ≈ 300–700 мс.
- **Python-микросервис ingest** отделён, потому что Docling и reranker — Python-мир;
  общение с NestJS — через HTTP + BullMQ-статусы.
- **BM25**: индекс строится в ingest (библиотека с армянской токенизацией — см. ниже),
  сериализуется и обслуживается тем же сервисом; альтернатива — Qdrant full-text +
  собственный стемминг. Решение принять в Фазе 0 по результатам теста качества.

## Армянский язык — технические решения

| Компонент | Решение | Риск / проверка (Фаза 0) |
|---|---|---|
| Embeddings | OpenAI `text-embedding-3-large` | Проверить recall@10 на 30 армянских Q→chunk парах; fallback: self-hosted `bge-m3` |
| BM25 | Lucene-совместимый армянский analyzer (стеммер Snowball hy) | Проверить, что стемминг не ломает термины домена |
| Reranker | `bge-reranker-v2-m3` | Проверить, что порядок top-5 осмыслен на армянском |
| LLM | GPT-4.1 / Claude Sonnet свободно пишут на армянском | Проверить качество формулировок с носителем |
| Чанкинг | По структуре Docling (заголовки/абзацы), 300–600 токенов, overlap 15% | Армянский текст ~ +20–30% токенов к английскому — учесть в бюджетах |

## Модель данных (PostgreSQL, основное)

```
users(id, email, password_hash, role[admin|client], status[active|blocked], created_at)
documents(id, title, type[pdf|docx|xlsx], s3_key, status[queued|processing|ready|failed],
          version, access_group_id NULL, pages, chunk_count, indexed_at, created_by)
chats(id, user_id, title, created_at)
messages(id, chat_id, role[user|assistant], content, confidence[high|low|refused],
         tokens_in, tokens_out, cached BOOL, created_at)
message_sources(id, message_id, document_id, page, sheet NULL, row NULL, chunk_id, score)
audit_log(id, admin_id, action, entity, entity_id, payload JSONB, created_at)
daily_stats(date, questions, refusals, low_confidence, tokens_in, tokens_out, cache_hits)
```

## Qdrant

Коллекция `chunks`: vector (3072, cosine, scalar-квантование), payload:
`{document_id, version, page, sheet, row, heading_path, text}`.
Alias `chunks_live` → атомарное переключение при замене документов.

## API (основные эндпоинты)

```
POST /auth/login, /auth/refresh
POST /chat/:chatId/messages          # SSE-стрим ответа
GET  /chat, /chat/:id/messages
--- admin ---
CRUD /admin/clients (+block)
POST /admin/documents (multipart), DELETE/PUT /admin/documents/:id
POST /admin/documents/:id/reindex
GET  /admin/documents/:id/status     # SSE прогресса индексации
GET  /admin/analytics/dashboard, /admin/analytics/questions, /admin/audit
```

## Конфигурация (env)

```
LLM_PROVIDER=openai|anthropic     LLM_MODEL=...
EMBEDDING_MODEL=text-embedding-3-large
RERANK_TOP_IN=20  RERANK_TOP_OUT=5
THRESHOLD_LOW=0.35  THRESHOLD_HIGH=0.62   # калибруются в Фазе 4
CHAT_HISTORY_MAX_MESSAGES=12
CACHE_TTL_SECONDS=604800
RATE_LIMIT_PER_MIN=20
```

## Наблюдаемость

pino-логи (JSON) → stdout; каждый ответ пишет метрики в `daily_stats`;
трейс запроса: request_id проходит web → api → ingest.
