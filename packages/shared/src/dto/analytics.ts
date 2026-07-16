import type { AuditLogEntry, DailyStats } from "../entities.js";

/** Сводка для дашборда админа (Фаза 5). */
export interface AnalyticsDashboard {
  totalClients: number;
  totalDocuments: number;
  readyDocuments: number;
  totalQuestions: number;
  /** Метрика здоровья базы знаний: высокий % → нужно догрузить документы. */
  refusalRate: number;
  lowConfidenceRate: number;
  cacheHitRate: number;
  tokensInTotal: number;
  tokensOutTotal: number;
  daily: DailyStats[];
}

/** Строка отчёта «популярные вопросы». */
export interface PopularQuestion {
  question: string;
  count: number;
  refusalRate: number;
}

/** Ответ /admin/analytics/questions: топ вопросов + последние без ответа. */
export interface PopularQuestionsResponse {
  popular: PopularQuestion[];
  /** Вопросы с отказом — прямая подсказка, какие документы догрузить. */
  refusedRecent: { question: string; createdAt: string }[];
}

/** Запись аудит-журнала для админки (сущность + email админа для отображения). */
export interface AuditLogView extends AuditLogEntry {
  adminEmail: string;
}
