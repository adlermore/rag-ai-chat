import { Injectable, Logger } from "@nestjs/common";
import { DocumentStatus, type DocumentType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { IngestClient } from "../ingest/ingest.client";

interface RegisterInput {
  title: string;
  type: DocumentType;
  path: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: IngestClient,
  ) {}

  /**
   * Регистрирует документ и запускает ингестию в фоне (без BullMQ — упрощённо;
   * очередь/SSE-статусы — следующий инкремент). Возвращает запись со статусом
   * processing; клиент опрашивает статус через list.
   */
  async register(input: RegisterInput, userId: string) {
    const doc = await this.prisma.document.create({
      data: {
        title: input.title,
        type: input.type,
        s3Key: input.path, // MinIO пока не подключён — храним путь (один сервер)
        status: DocumentStatus.processing,
        createdBy: userId,
      },
    });

    // Фоновая ингестия: не блокируем HTTP-ответ (парсинг+эмбеддинг долгие).
    void this.runIngestion(doc.id, input);
    return doc;
  }

  private async runIngestion(documentId: string, input: RegisterInput) {
    try {
      const result = await this.ingest.ingestPath({
        path: input.path,
        documentId,
        version: 1,
        title: input.title,
      });
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.ready,
          chunkCount: result.chunkCount,
          indexedAt: new Date(),
        },
      });
      this.logger.log(
        `Документ ${documentId} проиндексирован: ${result.chunkCount} чанков.`,
      );
    } catch (e) {
      this.logger.error(`Ингестия ${documentId} упала: ${e}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.failed,
          errorMessage: String(e).slice(0, 500),
        },
      });
    }
  }

  list(status?: DocumentStatus, search?: string) {
    return this.prisma.document.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? { title: { contains: search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  get(id: string) {
    return this.prisma.document.findUnique({ where: { id } });
  }
}
