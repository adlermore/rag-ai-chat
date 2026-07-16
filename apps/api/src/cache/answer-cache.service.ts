import { createHash } from "node:crypto";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { MessageSource } from "@rag/shared";

/** Закэшированный ответ пайплайна (без message-id — он у каждого чата свой). */
export interface CachedAnswer {
  content: string;
  confidence: "high" | "low" | "refused";
  sources: MessageSource[];
  tokensIn: number | null;
  tokensOut: number | null;
}

/**
 * Кэш ответов: нормализованный (переписанный) вопрос → готовый ответ
 * (docs/04-ROADMAP.md, Фаза 3). Инвалидация — версией базы знаний: ключ включает
 * kb:version, который инкрементируется при каждом изменении документов; старые
 * ключи умирают по TTL. Redis недоступен → кэш прозрачно выключен.
 */
@Injectable()
export class AnswerCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AnswerCacheService.name);
  private readonly redis: Redis | null;
  private readonly ttl: number;

  constructor(config: ConfigService) {
    this.ttl = config.get<number>("CACHE_TTL_SECONDS", 604800);
    const url = config.get<string>("REDIS_URL");
    if (url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
      });
      this.redis.on("error", (e) =>
        this.logger.warn(`Redis недоступен (кэш выключен): ${e.message}`),
      );
    } else {
      this.redis = null;
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  private normalize(question: string): string {
    return question.toLowerCase().replace(/\s+/g, " ").trim();
  }

  private async key(question: string): Promise<string> {
    const version = (await this.redis!.get("kb:version")) ?? "0";
    const hash = createHash("sha256")
      .update(this.normalize(question))
      .digest("hex");
    return `answer:v${version}:${hash}`;
  }

  async get(question: string): Promise<CachedAnswer | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(await this.key(question));
      return raw ? (JSON.parse(raw) as CachedAnswer) : null;
    } catch {
      return null;
    }
  }

  async set(question: string, answer: CachedAnswer): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        await this.key(question),
        JSON.stringify(answer),
        "EX",
        this.ttl,
      );
    } catch {
      /* кэш — best-effort */
    }
  }

  /** Вызывается при изменении базы знаний (документ проиндексирован/удалён). */
  async invalidateAll(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.incr("kb:version");
      this.logger.log("Кэш ответов инвалидирован (kb:version++).");
    } catch {
      /* best-effort */
    }
  }
}
