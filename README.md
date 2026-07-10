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

## Быстрый старт

```bash
cp .env.example .env          # заполнить секреты
pnpm install                  # установка зависимостей монорепо
pnpm infra:up                 # postgres, redis, qdrant, minio (Docker)
pnpm --filter @rag/api prisma:migrate   # миграции БД
pnpm --filter @rag/api seed             # создать первого админа
pnpm dev                      # web (:3000) + api (:4000) параллельно
```

## Статус по фазам (см. docs/04-ROADMAP.md)

- **Фаза 0** — проверка армянского retrieval (recall@5 ≥ 0.85). **Блокирующая**,
  ожидает реальных документов заказчика. Пока не пройдена — Фаза 2 не начинается.
- **Фаза 1** — каркас (это текущая работа): монорепо, инфраструктура, auth/RBAC,
  дизайн-система, миграции.
- Фазы 2–5 — ингестия, RAG-пайплайн, evaluation, аналитика.
