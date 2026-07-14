import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  Role,
  registerDocumentSchema,
  listDocumentsQuerySchema,
  type RegisterDocumentRequest,
  type ListDocumentsQuery,
} from "@rag/shared";
import type { DocumentStatus, DocumentType } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { DocumentsService } from "./documents.service";

/** Админ-управление документами базы знаний. Только роль admin. */
@Controller("admin/documents")
@Roles(Role.Admin)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listDocumentsQuerySchema))
    query: ListDocumentsQuery,
  ) {
    return this.documents.list(
      query.status as DocumentStatus | undefined,
      query.search,
    );
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.documents.get(id);
  }

  @Post()
  async register(
    @Body(new ZodValidationPipe(registerDocumentSchema))
    body: RegisterDocumentRequest,
    @CurrentUser() admin: AuthUser,
  ) {
    const doc = await this.documents.register(
      { title: body.title, type: body.type as DocumentType, path: body.path },
      admin.id,
    );
    await this.audit.log({
      adminId: admin.id,
      action: "document.register",
      entity: "document",
      entityId: doc.id,
      payload: { title: doc.title, type: doc.type },
    });
    return doc;
  }
}
