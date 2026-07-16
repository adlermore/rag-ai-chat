import { z } from "zod";

/** Статус вопроса eval-датасета (review админом, docs/05-EVALUATION.md). */
export const EvalStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;
export type EvalStatus = (typeof EvalStatus)[keyof typeof EvalStatus];

export interface EvalQuestionView {
  id: string;
  question: string;
  expectedAnswer: string;
  chunkId: string | null;
  documentId: string | null;
  mustRefuse: boolean;
  kind: "prose" | "table" | "trap";
  status: EvalStatus;
  createdAt: string;
}

export const reviewEvalQuestionSchema = z.object({
  status: z.enum([EvalStatus.Approved, EvalStatus.Rejected, EvalStatus.Pending]),
});
export type ReviewEvalQuestionRequest = z.infer<typeof reviewEvalQuestionSchema>;

export const listEvalQuestionsQuerySchema = z.object({
  status: z
    .enum([EvalStatus.Pending, EvalStatus.Approved, EvalStatus.Rejected])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListEvalQuestionsQuery = z.infer<typeof listEvalQuestionsQuerySchema>;

/** Импорт датасета из jsonl-файла на сервере (модель «один сервер»). */
export const importEvalSchema = z.object({
  path: z.string().min(1).max(1000),
});
export type ImportEvalRequest = z.infer<typeof importEvalSchema>;
