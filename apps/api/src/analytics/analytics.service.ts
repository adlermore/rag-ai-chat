import { Injectable } from "@nestjs/common";
import { Confidence, DocumentStatus, MessageRole, Role } from "@prisma/client";
import type {
  AnalyticsDashboard,
  AuditLogView,
  DailyStats,
  PopularQuestionsResponse,
} from "@rag/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Аналитика считается на лету из messages/documents/users — при текущих
 * объёмах (сотни-тысячи сообщений) агрегаты дешевле и честнее, чем отдельная
 * таблица daily_stats (материализация — при росте нагрузки).
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(): Promise<AnalyticsDashboard> {
    const [totalClients, totalDocuments, readyDocuments, answers, tokens] =
      await Promise.all([
        this.prisma.user.count({ where: { role: Role.client } }),
        this.prisma.document.count(),
        this.prisma.document.count({ where: { status: DocumentStatus.ready } }),
        this.prisma.message.groupBy({
          by: ["confidence"],
          where: { role: MessageRole.assistant },
          _count: { _all: true },
        }),
        this.prisma.message.aggregate({
          where: { role: MessageRole.assistant },
          _sum: { tokensIn: true, tokensOut: true },
          _count: { _all: true },
        }),
      ]);

    const total = tokens._count._all || 1;
    const byConf = Object.fromEntries(
      answers.map((a) => [a.confidence ?? "none", a._count._all]),
    );
    const cached = await this.prisma.message.count({
      where: { role: MessageRole.assistant, cached: true },
    });

    return {
      totalClients,
      totalDocuments,
      readyDocuments,
      totalQuestions: tokens._count._all,
      refusalRate: (byConf[Confidence.refused] ?? 0) / total,
      lowConfidenceRate: (byConf[Confidence.low] ?? 0) / total,
      cacheHitRate: cached / total,
      tokensInTotal: tokens._sum.tokensIn ?? 0,
      tokensOutTotal: tokens._sum.tokensOut ?? 0,
      daily: await this.daily(14),
    };
  }

  private async daily(days: number): Promise<DailyStats[]> {
    const rows = await this.prisma.$queryRaw<
      {
        date: string;
        questions: number;
        refusals: number;
        low_confidence: number;
        tokens_in: number;
        tokens_out: number;
        cache_hits: number;
      }[]
    >`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
             COUNT(*)::int                                         AS questions,
             SUM(CASE WHEN confidence = 'refused' THEN 1 ELSE 0 END)::int AS refusals,
             SUM(CASE WHEN confidence = 'low' THEN 1 ELSE 0 END)::int     AS low_confidence,
             COALESCE(SUM(tokens_in), 0)::int                      AS tokens_in,
             COALESCE(SUM(tokens_out), 0)::int                     AS tokens_out,
             SUM(CASE WHEN cached THEN 1 ELSE 0 END)::int          AS cache_hits
      FROM messages
      WHERE role = 'assistant'
        AND created_at >= now() - (${days} || ' days')::interval
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({
      date: r.date,
      questions: r.questions,
      refusals: r.refusals,
      lowConfidence: r.low_confidence,
      tokensIn: r.tokens_in,
      tokensOut: r.tokens_out,
      cacheHits: r.cache_hits,
    }));
  }

  async popularQuestions(limit = 20): Promise<PopularQuestionsResponse> {
    // Ответ на вопрос — первое assistant-сообщение после него в том же чате.
    const popular = await this.prisma.$queryRaw<
      { question: string; count: number; refusal_rate: number }[]
    >`
      SELECT q.question,
             COUNT(*)::int AS count,
             AVG(CASE WHEN a.confidence = 'refused' THEN 1.0 ELSE 0.0 END)::float AS refusal_rate
      FROM (
        SELECT id, chat_id, created_at, lower(trim(content)) AS question
        FROM messages WHERE role = 'user'
      ) q
      LEFT JOIN LATERAL (
        SELECT confidence FROM messages a
        WHERE a.chat_id = q.chat_id AND a.role = 'assistant'
          AND a.created_at > q.created_at
        ORDER BY a.created_at ASC LIMIT 1
      ) a ON true
      GROUP BY q.question
      ORDER BY count DESC, q.question
      LIMIT ${limit}
    `;

    const refusedRecent = await this.prisma.$queryRaw<
      { question: string; created_at: Date }[]
    >`
      SELECT q.content AS question, q.created_at
      FROM messages q
      JOIN LATERAL (
        SELECT confidence FROM messages a
        WHERE a.chat_id = q.chat_id AND a.role = 'assistant'
          AND a.created_at > q.created_at
        ORDER BY a.created_at ASC LIMIT 1
      ) a ON a.confidence = 'refused'
      WHERE q.role = 'user'
      ORDER BY q.created_at DESC
      LIMIT 20
    `;

    return {
      popular: popular.map((p) => ({
        question: p.question,
        count: p.count,
        refusalRate: p.refusal_rate,
      })),
      refusedRecent: refusedRecent.map((r) => ({
        question: r.question,
        createdAt: r.created_at.toISOString(),
      })),
    };
  }

  async questionsCsv(): Promise<string> {
    const { popular } = await this.popularQuestions(1000);
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ["question,count,refusal_rate"];
    for (const p of popular) {
      lines.push(`${esc(p.question)},${p.count},${p.refusalRate.toFixed(3)}`);
    }
    return lines.join("\n");
  }

  async audit(page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { admin: { select: { email: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);
    const items: AuditLogView[] = rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      adminEmail: r.admin.email,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      payload: (r.payload as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return { items, total, page, pageSize };
  }
}
