import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { DocumentStatus, type DocumentType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { IngestClient } from "../ingest/ingest.client";
import { AnswerCacheService } from "../cache/answer-cache.service";

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
    private readonly cache: AnswerCacheService,
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

  private async runIngestion(
    documentId: string,
    input: RegisterInput,
    version = 1,
  ) {
    try {
      const result = await this.ingest.ingestPath({
        path: input.path,
        documentId,
        version,
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
      // База знаний изменилась → закэшированные ответы могли устареть.
      await this.cache.invalidateAll();
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

  /**
   * Полное удаление: чанки из индекса → файл с диска → строка БД (вместе с
   * источниками старых сообщений — цитаты на удалённый документ мертвы) → кэш.
   */
  async remove(id: string) {
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id } });
    // Во время индексации удалять нельзя: фоновый ингест допишет точки в Qdrant
    // уже ПОСЛЕ удаления → осиротевшие чанки без документа (гонка).
    if (doc.status === DocumentStatus.processing) {
      throw new ConflictException("Փաստաթուղթը մշակվում է, փորձեք ավելի ուշ");
    }

    await this.ingest.deleteDocument(id);
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(doc.s3Key);
    } catch {
      /* файла может уже не быть — не блокируем удаление */
    }
    await this.prisma.$transaction([
      this.prisma.messageSource.deleteMany({ where: { documentId: id } }),
      this.prisma.document.delete({ where: { id } }),
    ]);
    await this.cache.invalidateAll();
    return doc;
  }

  /** Переиндексация из сохранённого файла (version+1, чанки пересоздаются). */
  async reindex(id: string) {
    const doc = await this.prisma.document.findUniqueOrThrow({ where: { id } });
    // Параллельная ингестия одного документа даёт дубли точек (гонка) —
    // сериализация очередью (BullMQ) впереди; пока просто запрещаем.
    if (doc.status === DocumentStatus.processing) {
      throw new ConflictException("Փաստաթուղթն արդեն մշակվում է");
    }
    const version = doc.version + 1;
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.processing, version, errorMessage: null },
    });
    void this.runIngestion(
      id,
      { title: doc.title, type: doc.type, path: doc.s3Key },
      version,
    );
    return updated;
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

  async get(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException("Փաստաթուղթը չգտնվեց");
    return doc;
  }
}
