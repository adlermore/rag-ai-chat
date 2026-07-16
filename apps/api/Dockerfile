# NestJS API. Контекст сборки — КОРЕНЬ монорепо:
#   docker build -f apps/api/Dockerfile .
FROM node:22-slim

RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Слои зависимостей — для кэширования пересборок.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @rag/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @rag/shared build \
 && pnpm --filter @rag/api prisma:generate \
 && pnpm --filter @rag/api build

WORKDIR /repo/apps/api
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Миграции применяются при старте (идемпотентно); seed создаёт первого админа
# (upsert — безопасен при повторных запусках).
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed || true; node dist/main.js"]
