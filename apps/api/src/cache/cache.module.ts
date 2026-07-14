import { Module } from "@nestjs/common";
import { AnswerCacheService } from "./answer-cache.service";

/** Redis-кэш ответов; используется chat (чтение/запись) и documents (инвалидация). */
@Module({
  providers: [AnswerCacheService],
  exports: [AnswerCacheService],
})
export class CacheModule {}
