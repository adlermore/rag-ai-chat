import type { DailyStats } from "../entities.js";

/** Сводка для дашборда админа (Фаза 5). */
export interface AnalyticsDashboard {
  totalClients: number;
  totalDocuments: number;
  readyDocuments: number;
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
