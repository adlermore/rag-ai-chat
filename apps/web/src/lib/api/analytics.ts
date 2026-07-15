import type {
  AnalyticsDashboard,
  AuditLogView,
  Paginated,
  PopularQuestionsResponse,
} from "@rag/shared";
import { apiFetch } from "./client";
import { tokenStorage } from "@/lib/auth/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const analyticsApi = {
  dashboard(): Promise<AnalyticsDashboard> {
    return apiFetch<AnalyticsDashboard>("/admin/analytics/dashboard");
  },
  questions(): Promise<PopularQuestionsResponse> {
    return apiFetch<PopularQuestionsResponse>("/admin/analytics/questions");
  },
  audit(page = 1, pageSize = 20): Promise<Paginated<AuditLogView>> {
    return apiFetch<Paginated<AuditLogView>>(
      `/admin/audit?page=${page}&pageSize=${pageSize}`,
    );
  },
  /** Скачивание CSV (fetch+blob: нужен Authorization-заголовок). */
  async downloadCsv(): Promise<void> {
    const res = await fetch(`${API_URL}/admin/analytics/questions/export`, {
      headers: { Authorization: `Bearer ${tokenStorage.access ?? ""}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};
