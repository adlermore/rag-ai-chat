import { z } from "zod";
import { DocumentStatus, DocumentType } from "../enums.js";

/**
 * Метаданные при загрузке документа (сам файл — multipart). Логика ингестии —
 * Фаза 2 (заблокирована Фазой 0); DTO объявлены заранее как контракт.
 */
export const uploadDocumentMetaSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.enum([DocumentType.Pdf, DocumentType.Docx, DocumentType.Xlsx]),
  accessGroupId: z.string().uuid().nullable().optional(),
});
export type UploadDocumentMeta = z.infer<typeof uploadDocumentMetaSchema>;

export const listDocumentsQuerySchema = z.object({
  status: z
    .enum([
      DocumentStatus.Queued,
      DocumentStatus.Processing,
      DocumentStatus.Ready,
      DocumentStatus.Failed,
    ])
    .optional(),
  search: z.string().max(300).optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

/** Событие прогресса индексации (SSE из админки, Фаза 2). */
export interface DocumentStatusEvent {
  documentId: string;
  status: DocumentStatus;
  progress: number; // 0..100
  message?: string;
}
