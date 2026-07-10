/**
 * Доменные сущности (форма, в которой API отдаёт данные наружу — DTO ответов).
 * Соответствуют таблицам PostgreSQL из docs/02-ARCHITECTURE.md, но БЕЗ секретов
 * (password_hash никогда не покидает сервер) и с ISO-датами (string) для JSON.
 */
import type {
  Confidence,
  DocumentStatus,
  DocumentType,
  MessageRole,
  Role,
  UserStatus,
} from "./enums.js";

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  version: number;
  /** Группа доступа — задел под v2, в v1 всегда null (см. CLAUDE.md). */
  accessGroupId: string | null;
  pages: number | null;
  chunkCount: number | null;
  indexedAt: string | null;
  createdBy: string;
  createdAt: string;
  /** Текст ошибки ингестии — присутствует только при status = "failed". */
  errorMessage?: string | null;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

/** Источник, на который опирается ответ AI (цитатный якорь ⟨n⟩ в UI). */
export interface MessageSource {
  id: string;
  documentId: string;
  /** Отображаемое имя документа (денормализовано для UI). */
  documentTitle: string;
  documentType: DocumentType;
  page: number | null;
  /** Для Excel: имя листа. */
  sheet: string | null;
  /** Для Excel: номер строки. */
  row: number | null;
  chunkId: string;
  score: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  /** Заполняется только для role = "assistant". */
  confidence: Confidence | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cached: boolean;
  createdAt: string;
  sources: MessageSource[];
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** Агрегированная дневная статистика (таблица daily_stats). */
export interface DailyStats {
  date: string;
  questions: number;
  refusals: number;
  lowConfidence: number;
  tokensIn: number;
  tokensOut: number;
  cacheHits: number;
}
