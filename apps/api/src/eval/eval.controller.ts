import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { EvalStatus as PrismaEvalStatus } from "@prisma/client";
import {
  Role,
  importEvalSchema,
  listEvalQuestionsQuerySchema,
  reviewEvalQuestionSchema,
  type ImportEvalRequest,
  type ListEvalQuestionsQuery,
  type ReviewEvalQuestionRequest,
} from "@rag/shared";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { EvalService } from "./eval.service";

/** Review eval-датасета. Только admin. */
@Controller("admin/eval")
@Roles(Role.Admin)
export class EvalController {
  constructor(
    private readonly evalService: EvalService,
    private readonly audit: AuditService,
  ) {}

  @Get("questions")
  list(
    @Query(new ZodValidationPipe(listEvalQuestionsQuerySchema))
    query: ListEvalQuestionsQuery,
  ) {
    return this.evalService.list(
      query.status as PrismaEvalStatus | undefined,
      query.page,
      query.pageSize,
    );
  }

  @Patch("questions/:id")
  async review(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewEvalQuestionSchema))
    body: ReviewEvalQuestionRequest,
    @CurrentUser() admin: AuthUser,
  ) {
    const updated = await this.evalService.review(
      id,
      body.status as PrismaEvalStatus,
    );
    await this.audit.log({
      adminId: admin.id,
      action: `eval.${body.status}`,
      entity: "eval_question",
      entityId: id,
      payload: { question: updated.question.slice(0, 120) },
    });
    return { ...updated, createdAt: updated.createdAt.toISOString() };
  }

  @Post("import")
  async importJsonl(
    @Body(new ZodValidationPipe(importEvalSchema)) body: ImportEvalRequest,
    @CurrentUser() admin: AuthUser,
  ) {
    const result = await this.evalService.importJsonl(body.path);
    await this.audit.log({
      adminId: admin.id,
      action: "eval.import",
      entity: "eval_question",
      payload: { path: body.path, ...result },
    });
    return result;
  }

  @Get("export")
  @Header("Content-Type", "application/jsonl; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="eval_approved.jsonl"')
  exportApproved() {
    return this.evalService.exportApprovedJsonl();
  }
}
