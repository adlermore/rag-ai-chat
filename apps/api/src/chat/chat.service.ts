import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Confidence, MessageRole } from "@prisma/client";
import type { ChatStreamEvent, MessageSource as MessageSourceDto } from "@rag/shared";
import { PrismaService } from "../prisma/prisma.service";
import { IngestClient, type RetrievalHit } from "../ingest/ingest.client";
import { classifyConfidence, shouldCallLlm } from "./guardrail";
import { LlmService } from "./llm/llm.service";

const REFUSAL_TEXT =
  "Ներողություն, այս հարցի պատասխանը հասանելի փաստաթղթերում չգտնվեց։";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: IngestClient,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  // ── чаты ──
  createChat(userId: string, title?: string) {
    return this.prisma.chat.create({
      data: { userId, title: title || "Նոր զրույց" },
    });
  }

  listChats(userId: string) {
    return this.prisma.chat.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listMessages(chatId: string, userId: string) {
    await this.assertOwnedChat(chatId, userId);
    return this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      include: { sources: true },
    });
  }

  private async assertOwnedChat(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat || chat.userId !== userId) {
      throw new NotFoundException("Զրույցը չգտնվեց");
    }
    return chat;
  }

  /**
   * Полный RAG-пайплайн одним потоком SSE-событий:
   * retrieval → guardrail → (LLM) → сохранение message+sources.
   * (Query rewrite и Redis-кэш — следующий инкремент; см. ROADMAP.)
   */
  async *streamAnswer(
    chatId: string,
    userId: string,
    content: string,
  ): AsyncGenerator<ChatStreamEvent> {
    await this.assertOwnedChat(chatId, userId);

    await this.prisma.message.create({
      data: { chatId, role: MessageRole.user, content },
    });

    const topOut = this.config.get<number>("RERANK_TOP_OUT", 5);
    const low = this.config.get<number>("THRESHOLD_LOW", 0.35);
    const high = this.config.get<number>("THRESHOLD_HIGH", 0.62);

    let hits: RetrievalHit[] = [];
    try {
      hits = await this.ingest.search(content, topOut);
    } catch (e) {
      this.logger.error(`retrieval упал: ${e}`);
      yield { type: "error", message: "Որոնման ծառայությունը հասանելի չէ։" };
      return;
    }

    const topScore = hits[0]?.score ?? 0;
    const confidence = classifyConfidence(topScore, { low, high });

    // Отказ БЕЗ вызова LLM (score ниже нижнего порога).
    if (!shouldCallLlm(confidence)) {
      const msg = await this.prisma.message.create({
        data: {
          chatId,
          role: MessageRole.assistant,
          content: REFUSAL_TEXT,
          confidence: Confidence.refused,
        },
      });
      yield { type: "token", value: REFUSAL_TEXT };
      yield { type: "done", messageId: msg.id, confidence: "refused" };
      return;
    }

    // Контекст с маркерами ⟨1⟩, ⟨2⟩ … в порядке hits.
    const contextBlocks = hits.map((h, i) => ({
      marker: String(i + 1),
      text: h.text,
    }));

    const history = await this.recentHistory(chatId);

    let answer = "";
    try {
      for await (const chunk of this.llm.streamAnswer({
        question: content,
        contextBlocks,
        history,
        lowConfidence: confidence === Confidence.low,
      })) {
        answer += chunk;
        yield { type: "token", value: chunk };
      }
    } catch (e) {
      this.logger.error(`LLM упал: ${e}`);
      yield { type: "error", message: "Պատասխանի գեներացիան ձախողվեց։" };
      return;
    }

    // Сохранение ответа + источников (только с валидным documentId в БД).
    const saved = await this.persistAnswer(chatId, answer, confidence, hits);

    yield { type: "sources", sources: saved.sources };
    yield {
      type: "done",
      messageId: saved.messageId,
      confidence: confidence === Confidence.high ? "high" : "low",
    };
  }

  private async recentHistory(chatId: string) {
    const max = this.config.get<number>("CHAT_HISTORY_MAX_MESSAGES", 12);
    const rows = await this.prisma.message.findMany({
      where: { chatId, role: { in: [MessageRole.user, MessageRole.assistant] } },
      orderBy: { createdAt: "desc" },
      take: max,
    });
    return rows
      .reverse()
      .map((m) => ({
        role: m.role === MessageRole.user ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));
  }

  private async persistAnswer(
    chatId: string,
    answer: string,
    confidence: Confidence,
    hits: RetrievalHit[],
  ) {
    const message = await this.prisma.message.create({
      data: { chatId, role: MessageRole.assistant, content: answer, confidence },
    });

    // FK: оставляем источники только для существующих документов.
    const docIds = [...new Set(hits.map((h) => h.documentId).filter(Boolean))] as string[];
    const existing = await this.prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true },
    });
    const validIds = new Set(existing.map((d) => d.id));

    const sourceData = hits
      .filter((h) => h.documentId && validIds.has(h.documentId))
      .map((h) => ({
        messageId: message.id,
        documentId: h.documentId as string,
        chunkId: h.chunkId,
        page: h.page,
        sheet: h.sheet,
        row: h.row,
        score: h.score,
      }));
    if (sourceData.length) {
      await this.prisma.messageSource.createMany({ data: sourceData });
    }

    const rows = await this.prisma.messageSource.findMany({
      where: { messageId: message.id },
      include: { document: { select: { title: true, type: true } } },
    });
    const sources: MessageSourceDto[] = rows.map((s) => ({
      id: s.id,
      documentId: s.documentId,
      documentTitle: s.document.title,
      documentType: s.document.type as MessageSourceDto["documentType"],
      page: s.page,
      sheet: s.sheet,
      row: s.row,
      chunkId: s.chunkId,
      score: s.score,
    }));
    return { messageId: message.id, sources };
  }
}
