# Enterprise RAG Assistant (հայերեն)

Внутренний корпоративный AI-ассистент, отвечающий на вопросы сотрудников
**исключительно на основе внутренних документов компании** (PDF/DOCX/XLSX),
на армянском языке, с обязательными источниками в каждом ответе.

Полная спецификация — в [`docs/`](./docs):
[01-SPEC](./docs/01-SPEC.md) ·
[02-ARCHITECTURE](./docs/02-ARCHITECTURE.md) ·
[03-DESIGN-SYSTEM](./docs/03-DESIGN-SYSTEM.md) ·
[04-ROADMAP](./docs/04-ROADMAP.md) ·
[05-EVALUATION](./docs/05-EVALUATION.md).
Правила разработки — в [`CLAUDE.md`](./CLAUDE.md).

## Структура (monorepo, pnpm workspaces)

```
apps/
  web/        # Next.js 15 (App Router): чат клиента + админ-панель
  api/        # NestJS + Fastify: auth, users, documents, chat, analytics
  ingest/     # Python FastAPI: Docling, chunking, embeddings (наполняется в Фазе 2)
packages/
  shared/     # общие типы TS (DTO, enum'ы) — контракт между web и api
  ui/         # обёртки shadcn-компонентов, дизайн-токены
docs/         # спецификация
docker/       # docker-compose: postgres, qdrant, redis, minio
```

## Требования

- Node.js ≥ 22, pnpm ≥ 9
- Docker + Docker Compose (для инфраструктуры)
- Python ≥ 3.11 (для `apps/ingest`, начиная с Фазы 2)

## Продовый запуск (один сервер, одна команда)

```bash
cp .env.example .env          # заполнить секреты (ANTHROPIC_API_KEY для ответов LLM)
docker compose -f docker/docker-compose.yml --profile app up -d --build
# web http://localhost:3000 · api :4000 · ingest :8000 · qdrant dashboard :6333/dashboard
# первый старт ingest качает веса bge-m3/reranker (~2.5GB) в volume hf_models
# миграции и seed админа (SEED_ADMIN_*) применяются автоматически при старте api
# ⚠️ на macOS (Docker Desktop = linux-VM) CPU-инференс bge-m3 заметно медленнее,
#    чем нативно; целевая среда — linux-сервер. Для разработки на Mac — режим ниже.
```

## Разработка

```bash
cp .env.example .env          # заполнить секреты
pnpm install                  # установка зависимостей монорепо
pnpm infra:up                 # только postgres, redis, qdrant, minio (Docker)
pnpm --filter @rag/api prisma:migrate   # миграции БД
pnpm --filter @rag/api seed             # создать первого админа
pnpm dev                      # web (:3000) + api (:4000) параллельно
# ingest: cd apps/ingest && pip install -r requirements.txt && uvicorn app.main:app --port 8000
```

## Статус по фазам (см. docs/04-ROADMAP.md)

Фазы 0–5 реализованы: армянский retrieval валидирован (recall@5=1.00 на
eval-датасете), ингестия с админкой (upload/reindex/delete), RAG-чат с
источниками ⟨n⟩ и двухпороговым guardrail (пороги откалиброваны), аналитика
и аудит. Оставшиеся хвосты — в `docs/04-ROADMAP.md`.
