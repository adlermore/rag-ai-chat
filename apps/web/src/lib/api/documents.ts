import { apiFetch, ApiError } from "./client";
import { tokenStorage } from "@/lib/auth/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type DocStatus = "queued" | "processing" | "ready" | "failed";

export interface AdminDocument {
  id: string;
  title: string;
  type: "pdf" | "docx" | "xlsx";
  status: DocStatus;
  chunkCount: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export const documentsApi = {
  list(): Promise<AdminDocument[]> {
    return apiFetch<AdminDocument[]>("/admin/documents");
  },

  remove(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/admin/documents/${id}`, {
      method: "DELETE",
    });
  },

  reindex(id: string): Promise<AdminDocument> {
    return apiFetch<AdminDocument>(`/admin/documents/${id}/reindex`, {
      method: "POST",
    });
  },

  /** Multipart-загрузка (apiFetch не годится: он сериализует body в JSON). */
  async upload(file: File, title: string): Promise<AdminDocument> {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("file", file);
    const res = await fetch(`${API_URL}/admin/documents/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStorage.access ?? ""}` },
      body: fd,
    });
    const data = (await res.json().catch(() => null)) as
      | (AdminDocument & { code?: string; message?: string })
      | null;
    if (!res.ok) {
      throw new ApiError(res.status, data?.code ?? "error", data?.message ?? "Սխալ");
    }
    return data as AdminDocument;
  },
};

/** Открывает оригинал документа: PDF — в новой вкладке, прочее — скачиванием.
 *  Файл за auth-заголовком, поэтому качаем blob и открываем object-URL. */
export async function openDocumentFile(
  documentId: string,
  title: string,
  type: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/documents/${documentId}/file`, {
    headers: { Authorization: `Bearer ${tokenStorage.access ?? ""}` },
  });
  if (!res.ok) throw new Error(`file ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (type === "pdf") {
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.${type}`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
