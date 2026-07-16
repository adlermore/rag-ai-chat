import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  createChatSchema,
  sendMessageSchema,
  type CreateChatRequest,
  type SendMessageRequest,
  type ChatStreamEvent,
} from "@rag/shared";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ChatService } from "./chat.service";

/** Чат клиента (и админа). Требует аутентификации (глобальный JwtAuthGuard). */
@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  createChat(
    @Body(new ZodValidationPipe(createChatSchema)) body: CreateChatRequest,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.createChat(user.id, body.title);
  }

  @Get()
  listChats(@CurrentUser() user: AuthUser) {
    return this.chat.listChats(user.id);
  }

  @Get(":id/messages")
  listMessages(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.listMessages(id, user.id);
  }

  /** Вопрос пользователя → ответ SSE-потоком (token/sources/done/error). */
  @Post(":id/messages")
  async sendMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageRequest,
    @CurrentUser() user: AuthUser,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    // hijack обходит хуки Fastify (в т.ч. CORS) — ставим CORS-заголовки вручную,
    // иначе браузер заблокирует чтение SSE-потока с другого origin.
    const origin = reply.request.headers.origin;
    if (origin) {
      reply.raw.setHeader("Access-Control-Allow-Origin", origin);
      reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      reply.raw.setHeader("Vary", "Origin");
    }
    reply.hijack(); // забираем сырой ответ у Fastify

    const send = (event: ChatStreamEvent) =>
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

    try {
      for await (const event of this.chat.streamAnswer(id, user.id, body.content)) {
        send(event);
      }
    } catch (e) {
      send({ type: "error", message: e instanceof Error ? e.message : "Սխալ" });
    } finally {
      reply.raw.end();
    }
  }
}
