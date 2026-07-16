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

## Армянский язык — технические решения (вердикт Фазы 0)

**Статус: ✅ критерий выхода пройден** (hybrid+rerank recall@5 ≥ 0.85).
Прогон: 2026-07-14, корпус — 3 реальных документа заказчика (Трудовой кодекс РА,
постановление о командировках, Закон о ЦБ РА), 494 чанка, 25 армянских вопросов
с известными целевыми чанками. Harness и отчёт: `apps/ingest/phase0/`.

| Компонент | Решение (по итогам Фазы 0) | Результат замера |
|---|---|---|
| Embeddings | **self-hosted `bge-m3`** (dense, 1024-мерн.) — валидирован и бесплатен | dense R@5=0.92; hybrid+rerank R@5=0.96, R@1=0.80, MRR=0.88 |
| BM25 | Оставляем в гибриде; стеммер в Фазе 0 — заглушка (`tokenizer_hy.py`), в проде заменить на полноценный армянский analyzer | bm25 R@5=0.92, но R@1=0.52 (слаб на top-1) |
| Reranker | `bge-reranker-v2-m3` — **подтверждён, оставляем** | +0.12 к R@1, +0.10 к MRR против чистого hybrid |
| LLM | GPT-4.1 / Claude Sonnet свободно пишут на армянском | качество формулировок с носителем — проверка отложена в Фазу 5 |
| Чанкинг | По структуре Docling, 300–600 токенов, overlap 15%. **Размер мерить токенайзером модели эмбеддинга** | см. находку ниже |

**Ключевые находки Фазы 0:**

- **`bge-m3` (self-hosted, CPU) уже проходит порог** — для эмбеддингов OpenAI может
  не требоваться. `text-embedding-3-large` в этом прогоне **не сравнивался** (нулевая
  квота OpenAI-аккаунта); при необходимости сравнить — повторить прогон
  `--embedders openai,bge-m3 --rerank`. Пока принимаем `bge-m3` как основной.
- **⚠️ Размерность вектора:** `bge-m3` = **1024**, а коллекция Qdrant ниже описана как
  3072 (под `text-embedding-3-large`). При фиксации `bge-m3` как основного —
  привести размер вектора Qdrant к 1024.
- **⚠️ Токенайзер для чанкинга:** размер чанка нельзя мерить `tiktoken/cl100k` — он
  переоценивает армянский в **~9–16×** (замер), из-за чего чанки выходили по 1–2
  предложения. Меряем токенайзером модели эмбеддинга (XLM-Roberta / `bge-m3`,
  ~1.8 токена/слово). Учтено в `apps/ingest/phase0/chunking.py`.
- **Оговорка по выборке:** 25 вопросов составлены ассистентом по реальным чанкам —
  результат индикативный; перед продом желателен review носителем (Фаза 4/5) и
  расширение набора.

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
