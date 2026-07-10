import { z } from "zod";
import type { MessageSource } from "../entities.js";
import type { Confidence } from "../enums.js";

export const createChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateChatRequest = z.infer<typeof createChatSchema>;

/** Отправка вопроса пользователя (ответ приходит SSE-стримом). */
export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

/**
 * Типы SSE-событий стрима ответа (Фаза 3). Объявлены заранее как контракт web↔api.
 * token   — очередной кусок текста ответа.
 * sources — блок источников (дорисовывается в конце).
 * done    — финал с итоговыми метаданными.
 * error   — ошибка во время генерации.
 */
export type ChatStreamEvent =
  | { type: "token"; value: string }
  | { type: "sources"; sources: MessageSource[] }
  | { type: "done"; messageId: string; confidence: Confidence }
  | { type: "error"; message: string };
