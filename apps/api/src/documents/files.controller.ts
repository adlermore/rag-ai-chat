import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from "@nestjs/common";
import { Header } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Раздача оригиналов документов аутентифицированным пользователям (клиентам
 * тоже: база знаний общая, доступ к документам в v1 не разграничен —
 * docs/01-SPEC). Открывается из карточки источника в чате: PDF — inline во
 * вьювере браузера, DOCX/XLSX — скачиванием.
 */
@Controller("documents")
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id/file")
  @Header("Cache-Control", "private, max-age=3600")
  async file(@Param("id", ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException("Փաստաթուղթը չգտնվեց");
    try {
      await stat(doc.s3Key);
    } catch {
      throw new NotFoundException("Ֆայլը հասանելի չէ");
    }

    const filename = encodeURIComponent(`${doc.title}.${doc.type}`);
    return new StreamableFile(createReadStream(doc.s3Key), {
      type: MIME[doc.type] ?? "application/octet-stream",
      disposition: `inline; filename*=UTF-8''${filename}`,
    });
  }
}
