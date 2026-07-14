import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import "@fastify/multipart"; // типы req.file() (declaration merging)
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

  /**
   * Multipart-загрузка файла из админки (модель «один сервер»: файл сохраняется
   * на диск, MinIO — следующий инкремент). Поле формы: file (+ опционально title).
   */
  @Post("upload")
  async upload(@Req() req: FastifyRequest, @CurrentUser() admin: AuthUser) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException("Ֆայլը բացակայում է");
    }
    const ext = extname(file.filename ?? "").toLowerCase();
    const type = ({ ".pdf": "pdf", ".docx": "docx", ".xlsx": "xlsx" } as const)[
      ext as ".pdf" | ".docx" | ".xlsx"
    ];
    if (!type) {
      throw new BadRequestException(`Չսպասարկվող ֆորմատ՝ ${ext || "—"}`);
    }

    const dir = resolve(process.cwd(), "var/uploads");
    await mkdir(dir, { recursive: true });
    const dest = join(dir, `${randomUUID()}${ext}`);
    await pipeline(file.file, createWriteStream(dest));
    if (file.file.truncated) {
      throw new BadRequestException("Ֆայլը գերազանցում է չափի սահմանը");
    }

    const titleField = file.fields["title"];
    const title =
      (titleField && "value" in titleField
        ? String(titleField.value).trim()
        : "") || file.filename;

    const doc = await this.documents.register(
      { title, type: type as DocumentType, path: dest },
      admin.id,
    );
    await this.audit.log({
      adminId: admin.id,
      action: "document.upload",
      entity: "document",
      entityId: doc.id,
      payload: { title: doc.title, type: doc.type },
    });
    return doc;
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
