# 06 — Деплой на сервер (Hetzner Cloud / Ubuntu)

Целевая среда — **один сервер + Docker Compose**. Проверено на Hetzner **CX32**
(4 vCPU / 8 GB / 80 GB, Ubuntu 24.04). 8 GB — минимум: `ingest` держит `bge-m3`
и reranker на CPU, поэтому в bootstrap добавляется swap.

## 1. Подключение

IP сервера — в console.hetzner.com (карточка сервера). С локальной машины:

```bash
ssh root@<IP-сервера>
```

## 2. Подготовка сервера (один раз)

Скопировать код на сервер и запустить bootstrap (обновление, swap, Docker, ufw):

```bash
git clone <ваш-репозиторий> rag-ai-chat
cd rag-ai-chat
bash deploy/bootstrap.sh
```

Firewall после этого пропускает наружу только SSH + 80/443; внутренние порты
(5432/6333/6379/9000) недоступны из интернета.

## 3. Секреты — `.env`

```bash
cp .env.example .env
nano .env
```

Обязательно сменить:

| Переменная | Значение |
|---|---|
| `POSTGRES_PASSWORD` | сильный пароль |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `openssl rand -hex 32` каждый |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | первый админ (создаётся при старте) |
| `MINIO_ROOT_USER/PASSWORD`, `S3_ACCESS_KEY/SECRET` | сменить дефолты |
| `NEXT_PUBLIC_API_URL` | **публичный** URL API (вшивается в бандл на сборке!) |
| `CORS_ORIGINS` | публичный origin веба |
| `LLM_PROVIDER` + ключ | для боевых ответов (это реальные токены) |
| `NEXT_PUBLIC_DEMO` | `0`, чтобы убрать бейдж «Демо» |

## 4. Запуск

```bash
docker compose -f docker/docker-compose.yml --profile app up -d --build
```

API при старте сам применит миграции (`prisma migrate deploy`) и создаст
seed-админа. Первый старт `ingest` качает веса моделей (~2–4 GB) в volume
`hf_models` — несколько минут.

```bash
docker compose -f docker/docker-compose.yml ps            # все healthy
docker compose -f docker/docker-compose.yml logs -f ingest # ждём загрузку моделей
curl http://localhost:4000/health
```

## 5. Доступ

### Вариант A — быстрый тест по IP
В `.env`: `NEXT_PUBLIC_API_URL=http://<IP>:4000`, `CORS_ORIGINS=http://<IP>:3000`,
затем `ufw allow 3000 && ufw allow 4000`, пересобрать web и открыть `http://<IP>:3000`.
Не для продакшена (без HTTPS).

### Вариант B — домен + HTTPS (рекомендуется)
1. A-запись домена → IP сервера.
2. В `.env`: `NEXT_PUBLIC_API_URL=https://<домен>/api`, `CORS_ORIGINS=https://<домен>`.
3. Пересобрать web (build-arg вшивается): `docker compose -f docker/docker-compose.yml --profile app up -d --build web`.
4. Прописать домен в `deploy/Caddyfile` и поднять Caddy (авто-TLS):
   ```bash
   docker run -d --name caddy --restart unless-stopped --network host \
     -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile" \
     -v caddy_data:/data -v caddy_config:/config caddy:2
   ```

## 6. Первый вход

Открыть веб → войти под `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` → в админке
загрузить документы, дождаться статуса «Պатրast».

## 7. Обновление / бэкапы / логи

```bash
# обновление кода
git pull && docker compose -f docker/docker-compose.yml --profile app up -d --build
# если менялся NEXT_PUBLIC_API_URL — обязательно пересобрать web
docker compose -f docker/docker-compose.yml --profile app up -d --build web

# бэкап БД
docker exec rag-postgres pg_dump -U rag rag > backup-$(date +%F).sql
# важные volume: postgres_data, qdrant_data, uploads_data, minio_data, redis_data

# логи
docker compose -f docker/docker-compose.yml logs -f api web ingest
```

## Тюнинг под слабый CPU-сервер (напр. Hetzner CX32, 4 vCPU)

Добавьте в `.env`:
```dotenv
RERANKER_BACKEND=onnx-int8   # ONNX int8 reranker — в 2-4× быстрее torch на CPU
OMP_NUM_THREADS=4            # под число ядер (8>ядер даёт пробуксовку потоков)
RERANK_TOP_IN=6             # меньше кандидатов реранкинга → быстрее (по умолч. 10)
```
Замер на Hetzner CX32: гибридный поиск ~45с (torch, top_in=10) → **~6с**
(onnx-int8, top_in=6). ONNX-модель квантуется один раз при старте (~4 мин) и
кэшируется в volume `/models`.
Docling парсит таблицы в режиме `TableFormerMode.FAST` (иначе многостраничный PDF
на CPU обрабатывается десятки минут). Индексация большого документа (~1000+
чанков) на 4 vCPU занимает 15–20 мин — это нормально (эмбеддинг на CPU).

## Замечания по безопасности

- Не коммитить реальный `.env`.
- Ротировать любой API-ключ, попавший в переписку/логи.
- Оставлять открытыми наружу только 80/443 (bootstrap это делает через ufw).
