import { z } from "zod";

/** Пагинация списков (админ-таблицы). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Обёртка постраничного ответа. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Единый формат ошибки API (сообщение — ключ i18n или готовый армянский текст). */
export interface ApiError {
  statusCode: number;
  /** Машиночитаемый код (например "auth.invalid_credentials"). */
  code: string;
  /** Человекочитаемое сообщение на армянском. */
  message: string;
}
