/**
 * Перечисления домена. Значения совпадают со строковыми enum'ами в Prisma-схеме
 * (apps/api/prisma/schema.prisma) — это единый контракт между БД, API и web.
 */

/** Роли пользователей. RBAC строится на этих значениях. */
export const Role = {
  Admin: "admin",
  Client: "client",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Статус учётной записи (админ может блокировать клиентов). */
export const UserStatus = {
  Active: "active",
  Blocked: "blocked",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Тип загружаемого документа базы знаний. */
export const DocumentType = {
  Pdf: "pdf",
  Docx: "docx",
  Xlsx: "xlsx",
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/** Статус ингестии документа (жизненный цикл в BullMQ-пайплайне). */
export const DocumentStatus = {
  Queued: "queued",
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** Роль сообщения в диалоге. */
export const MessageRole = {
  User: "user",
  Assistant: "assistant",
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/**
 * Уровень уверенности ответа (двухпороговая guardrail-схема, см. docs/01-SPEC.md).
 * high  — score ≥ T_high, обычный ответ.
 * low   — T_low ≤ score < T_high, ответ с пометкой о неуверенности.
 * refused — score < T_low, отказ БЕЗ вызова LLM.
 */
export const Confidence = {
  High: "high",
  Low: "low",
  Refused: "refused",
} as const;
export type Confidence = (typeof Confidence)[keyof typeof Confidence];
