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

/**
 * Регистрация документа по серверному пути (модель «один сервер», docs/01-SPEC).
 * Файл уже лежит на сервере; api создаёт запись и запускает ингестию.
 * (Загрузка через MinIO/multipart — следующий инкремент.)
 */
export const registerDocumentSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.enum([DocumentType.Pdf, DocumentType.Docx, DocumentType.Xlsx]),
  path: z.string().min(1).max(1000),
});
export type RegisterDocumentRequest = z.infer<typeof registerDocumentSchema>;

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
