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

/** Качает оригинал (файл за auth-заголовком) и возвращает object-URL. */
export async function fetchDocumentBlobUrl(documentId: string): Promise<string> {
  const res = await fetch(`${API_URL}/documents/${documentId}/file`, {
    headers: { Authorization: `Bearer ${tokenStorage.access ?? ""}` },
  });
  if (!res.ok) throw new Error(`file ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** Скачивание файла (DOCX/XLSX — браузер их не рендерит). */
export async function downloadDocumentFile(
  documentId: string,
  title: string,
  type: string,
): Promise<void> {
  const url = await fetchDocumentBlobUrl(documentId);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.${type}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Открытие PDF в новой вкладке БЕЗ блокировки попапа: окно открывается
 * синхронно в user-gesture (до await), URL подставляется после загрузки.
 */
export function openDocumentInNewTab(documentId: string): void {
  const w = window.open("", "_blank");
  fetchDocumentBlobUrl(documentId)
    .then((url) => {
      if (w) w.location.href = url;
    })
    .catch(() => w?.close());
}
