import { z } from "zod";

/**
 * Валидация переменных окружения при старте. Если чего-то не хватает —
 * приложение падает сразу с понятной ошибкой, а не в рантайме.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  RATE_LIMIT_PER_MIN: z.coerce.number().int().default(20),

  // Опциональны в Фазе 1 (нужны с Фазы 2+).
  REDIS_URL: z.string().optional(),
  QDRANT_URL: z.string().optional(),
  INGEST_URL: z.string().default("http://localhost:8000"),

  // ── RAG / чат (Фаза 3) ──
  LLM_PROVIDER: z.enum(["openai", "anthropic", "stub"]).default("stub"),
  LLM_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  RERANK_TOP_OUT: z.coerce.number().int().default(5),
  // Двухпороговый guardrail (docs/01-SPEC.md): score reranker'а в [0..1].
  THRESHOLD_LOW: z.coerce.number().default(0.35),
  THRESHOLD_HIGH: z.coerce.number().default(0.62),

  CHAT_HISTORY_MAX_MESSAGES: z.coerce.number().int().default(12),
  CACHE_TTL_SECONDS: z.coerce.number().int().default(604800),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Некорректные переменные окружения:\n${issues}`);
  }
  return parsed.data;
}
