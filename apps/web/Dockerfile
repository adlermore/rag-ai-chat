# Next.js web. Контекст сборки — КОРЕНЬ монорепо:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .
FROM node:22-slim

RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @rag/web...

COPY packages packages
COPY apps/web apps/web

# NEXT_PUBLIC_* вшивается в бандл на этапе next build.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @rag/shared build && pnpm --filter @rag/web build

WORKDIR /repo/apps/web
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
