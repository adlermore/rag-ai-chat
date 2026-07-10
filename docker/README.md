# Инфраструктура (Docker Compose)

Локальная инфраструктура для разработки: PostgreSQL, Redis, Qdrant, MinIO.
Целевая продакшн-среда — тот же стек на одном сервере (см. `CLAUDE.md`).

## Запуск

```bash
pnpm infra:up      # поднять всё в фоне
pnpm infra:ps      # статус + healthchecks
pnpm infra:logs    # логи всех сервисов
pnpm infra:down    # остановить (данные сохраняются в volumes)
```

Значения (пароли, порты, имя бакета) берутся из корневого `.env`
(`--env-file .env`). Скопируйте `.env.example` → `.env` перед запуском.

## Сервисы и доступы

| Сервис | Порт(ы) | Доступ |
|---|---|---|
| PostgreSQL 16 | `5432` | `postgres://$POSTGRES_USER:***@localhost:5432/$POSTGRES_DB` |
| Redis 7 | `6379` | AOF-персистентность включена |
| Qdrant 1.12 | `6333` REST/UI, `6334` gRPC | Dashboard: http://localhost:6333/dashboard |
| MinIO | `9000` S3 API, `9001` консоль | Консоль: http://localhost:9001 (логин из `MINIO_ROOT_USER`) |

Сервис `minio-setup` — одноразовый: создаёт бакет `$S3_BUCKET` и завершается.

## Healthchecks

У всех сервисов настроены healthcheck'и (`pnpm infra:ps` покажет `healthy`).
API дожидается статуса `healthy` перед подключением. Данные хранятся в
именованных Docker volumes (`postgres_data`, `redis_data`, `qdrant_data`,
`minio_data`) — `infra:down` их не удаляет; для полной очистки:
`docker compose --env-file .env -f docker/docker-compose.yml down -v`.
