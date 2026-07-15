import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Confidence, MessageRole } from "@prisma/client";
import type { ChatStreamEvent, MessageSource as MessageSourceDto } from "@rag/shared";
import { PrismaService } from "../prisma/prisma.service";
import { IngestClient, type RetrievalHit } from "../ingest/ingest.client";
import {
  AnswerCacheService,
  type CachedAnswer,
} from "../cache/answer-cache.service";
import { classifyConfidence, shouldCallLlm } from "./guardrail";
import { detectSmallTalk } from "./smalltalk";
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
    private readonly cache: AnswerCacheService,
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
    const rows = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      // Название/тип документа денормализуются в DTO источника (контракт
      // @rag/shared MessageSource) — иначе история рендерит пустые карточки.
      include: {
        sources: {
          include: { document: { select: { title: true, type: true } } },
        },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      confidence: m.confidence,
      createdAt: m.createdAt,
      sources: m.sources.map((s) => ({
        id: s.id,
        documentId: s.documentId,
        documentTitle: s.document.title,
        documentType: s.document.type,
        page: s.page,
        sheet: s.sheet,
        row: s.row,
        chunkId: s.chunkId,
        score: s.score,
        snippet: s.snippet,
      })),
    }));
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
   * query rewrite → кэш → retrieval → guardrail → LLM → сохранение
   * message + sources + токен-метрик. (Grounding-проверка — след. инкремент.)
   */
  async *streamAnswer(
    chatId: string,
    userId: string,
    content: string,
  ): AsyncGenerator<ChatStreamEvent> {
    await this.assertOwnedChat(chatId, userId);

    // Историю читаем ДО записи вопроса (для rewrite нужен прошлый контекст).
    const history = await this.recentHistory(chatId);

    await this.prisma.message.create({
      data: { chatId, role: MessageRole.user, content },
    });

    // Разговорная реплика (приветствие/благодарность/прощание/«что умеешь») —
    // это НЕ вопрос к базе. Отвечаем сразу, без retrieval и без LLM (0 токенов,
    // мгновенно). Фактологический guardrail не затрагивается — предметные
    // вопросы по-прежнему идут ниже через поиск с порогами.
    const smalltalk = detectSmallTalk(content);
    if (smalltalk) {
      const reply: CachedAnswer = {
        content: smalltalk.reply,
        confidence: "high",
        sources: [],
        tokensIn: null,
        tokensOut: null,
      };
      const saved = await this.persistAnswer(chatId, reply, { cached: false });
      yield { type: "token", value: smalltalk.reply };
      yield { type: "done", messageId: saved.messageId, confidence: "high" };
      return;
    }

    // Follow-up («а минимальная?») переписываем в самостоятельный вопрос —
    // иначе retrieval ищет по обрывку. Первый вопрос чата — как есть.
    // ПАРАЛЛЕЛЬ (perf): rewrite и «оптимистичный» поиск по сырому вопросу идут
    // одновременно; если rewrite ничего не изменил (частый случай) — результат
    // поиска уже готов, экономим полный LLM-вызов из критического пути.
    const topOut = this.config.get<number>("RERANK_TOP_OUT", 5);
    let query = content;
    let prefetched: RetrievalHit[] | null = null;
    if (history.length > 0) {
      const [rewritten, optimistic] = await Promise.all([
        this.llm.rewrite(content, history),
        this.ingest.search(content, topOut).catch(() => null),
      ]);
      query = rewritten;
      if (query === content) {
        prefetched = optimistic;
      } else {
        this.logger.log(`rewrite: «${content}» → «${query}»`);
      }
    }

    // Кэш: нормализованный переписанный вопрос → готовый ответ.
    const cached = await this.cache.get(query);
    if (cached) {
      const saved = await this.persistAnswer(chatId, cached, { cached: true });
      yield { type: "token", value: cached.content };
      if (saved.sources.length) {
        yield { type: "sources", sources: saved.sources };
      }
      yield { type: "done", messageId: saved.messageId, confidence: cached.confidence };
      return;
    }

    const low = this.config.get<number>("THRESHOLD_LOW", 0.35);
    const high = this.config.get<number>("THRESHOLD_HIGH", 0.62);

    let hits: RetrievalHit[] = [];
    try {
      hits = prefetched ?? (await this.ingest.search(query, topOut));
    } catch (e) {
      this.logger.error(`retrieval упал: ${e}`);
      yield { type: "error", message: "Որոնման ծառայությունը հասանելի չէ։" };
      return;
    }

    const topScore = hits[0]?.score ?? 0;
    const confidence = classifyConfidence(topScore, { low, high });

    // Отказ БЕЗ вызова LLM (score ниже нижнего порога).
    if (!shouldCallLlm(confidence)) {
      const refusal: CachedAnswer = {
        content: REFUSAL_TEXT,
        confidence: "refused",
        sources: [],
        tokensIn: null,
        tokensOut: null,
      };
      const saved = await this.persistAnswer(chatId, refusal, { cached: false });
      await this.cache.set(query, refusal);
      yield { type: "token", value: REFUSAL_TEXT };
      yield { type: "done", messageId: saved.messageId, confidence: "refused" };
      return;
    }

    // Контекст с маркерами ⟨1⟩, ⟨2⟩ … в порядке hits.
    const contextBlocks = hits.map((h, i) => ({
      marker: String(i + 1),
      text: h.text,
    }));

    // НАСТОЯЩИЙ стриминг: дельты уходят пользователю по мере генерации LLM
    // (TTFT — приоритет проекта), итог генератора несёт полный текст + usage.
    let completion;
    try {
      const gen = this.llm.streamCompletion({
        question: query,
        contextBlocks,
        history,
        lowConfidence: confidence === Confidence.low,
      });
      for (;;) {
        const r = await gen.next();
        if (r.done) {
          completion = r.value;
          break;
        }
        yield { type: "token", value: r.value };
      }
    } catch (e) {
      this.logger.error(`LLM упал: ${e}`);
      yield { type: "error", message: "Պատասխանի գեներացիան ձախողվեց։" };
      return;
    }

    const answer: CachedAnswer = {
      content: completion.text,
      confidence: confidence === Confidence.high ? "high" : "low",
      sources: this.hitsToSourceDtos(hits),
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
    };
    const saved = await this.persistAnswer(chatId, answer, { cached: false });
    await this.cache.set(query, answer);

    yield { type: "sources", sources: saved.sources };
    yield { type: "done", messageId: saved.messageId, confidence: answer.confidence };
  }

  /** DTO источников из retrieval-хитов (для кэша и сохранения). */
  private hitsToSourceDtos(hits: RetrievalHit[]): MessageSourceDto[] {
    return hits
      .filter((h) => h.documentId)
      .map((h) => ({
        id: h.chunkId, // временный id; при сохранении заменяется на строку БД
        documentId: h.documentId as string,
        documentTitle: h.docTitle ?? "",
        documentType: "pdf" as MessageSourceDto["documentType"], // уточняется из БД при сохранении
        page: h.page,
        sheet: h.sheet,
        row: h.row,
        chunkId: h.chunkId,
        score: h.score,
        snippet: h.text ? h.text.slice(0, 240) : null,
      }));
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
    answer: CachedAnswer,
    opts: { cached: boolean },
  ) {
    const message = await this.prisma.message.create({
      data: {
        chatId,
        role: MessageRole.assistant,
        content: answer.content,
        confidence: answer.confidence as Confidence,
        cached: opts.cached,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut,
      },
    });

    // FK: оставляем источники только для существующих документов.
    const docIds = [...new Set(answer.sources.map((s) => s.documentId))];
    const existing = await this.prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true },
    });
    const validIds = new Set(existing.map((d) => d.id));

    const sourceData = answer.sources
      .filter((s) => validIds.has(s.documentId))
      .map((s) => ({
        messageId: message.id,
        documentId: s.documentId,
        chunkId: s.chunkId,
        page: s.page,
        sheet: s.sheet,
        row: s.row,
        score: s.score,
        snippet: s.snippet,
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
      snippet: s.snippet,
    }));
    return { messageId: message.id, sources };
  }
}
