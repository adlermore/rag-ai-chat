import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

/**
 * Единый формат ошибки (совместим с ApiError из @rag/shared).
 * Сообщения — на армянском; технические детали в лог, не пользователю.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "internal_error";
    let message = "Ներքին սխալ։ Փորձեք կրկին";
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") {
        message = response;
        code = exception.name;
      } else if (typeof response === "object" && response !== null) {
        const r = response as Record<string, unknown>;
        code = typeof r.code === "string" ? r.code : exception.name;
        message = typeof r.message === "string" ? r.message : message;
        const { code: _c, message: _m, statusCode: _s, ...rest } = r;
        extra = rest;
      }
    } else {
      this.logger.error(exception);
    }

    void reply.status(statusCode).send({ statusCode, code, message, ...extra });
  }
}
