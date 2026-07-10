import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "../decorators/current-user.decorator";

/**
 * Rate limiting per-user (docs/01-SPEC.md: 20 вопросов/мин). Для аутентифицированных
 * ключ — id пользователя, иначе — IP. Хранилище in-memory (целевая среда — один
 * сервер; для горизонтального масштабирования подключить @nest-lab/throttler-storage-redis).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: FastifyRequest): Promise<string> {
    const user = (req as FastifyRequest & { user?: AuthUser }).user;
    return user?.id ?? req.ip;
  }
}
