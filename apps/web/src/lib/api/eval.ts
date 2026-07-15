import type { EvalQuestionView, EvalStatus } from "@rag/shared";
import { apiFetch } from "./client";
import { tokenStorage } from "@/lib/auth/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface EvalList {
  items: EvalQuestionView[];
  total: number;
  page: number;
  pageSize: number;
  countsByStatus: Partial<Record<EvalStatus, number>>;
}

export const evalApi = {
  list(status: EvalStatus | "all", page = 1, pageSize = 20): Promise<EvalList> {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status !== "all") q.set("status", status);
    return apiFetch<EvalList>(`/admin/eval/questions?${q}`);
  },
  review(id: string, status: EvalStatus): Promise<EvalQuestionView> {
    return apiFetch<EvalQuestionView>(`/admin/eval/questions/${id}`, {
      method: "PATCH",
      body: { status },
    });
  },
  async downloadApproved(): Promise<void> {
    const res = await fetch(`${API_URL}/admin/eval/export`, {
      headers: { Authorization: `Bearer ${tokenStorage.access ?? ""}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eval_approved.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  },
};
