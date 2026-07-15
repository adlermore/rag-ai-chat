import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { EvalStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface ImportedRow {
  question?: string;
  expected_answer?: string;
  chunk_id?: string | null;
  document_id?: string | null;
  must_refuse?: boolean;
  kind?: string;
}

/** Review eval-датасета админом (docs/05-EVALUATION.md §Генерация). */
@Injectable()
export class EvalService {
  private readonly logger = new Logger(EvalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(status: EvalStatus | undefined, page: number, pageSize: number) {
    const where = status ? { status } : {};
    const [rows, total, counts] = await Promise.all([
      this.prisma.evalQuestion.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.evalQuestion.count({ where }),
      this.prisma.evalQuestion.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total,
      page,
      pageSize,
      countsByStatus: Object.fromEntries(
        counts.map((c) => [c.status, c._count._all]),
      ),
    };
  }

  async review(id: string, status: EvalStatus) {
    return this.prisma.evalQuestion.update({ where: { id }, data: { status } });
  }

  /** Импорт jsonl-файла (eval/gen_dataset.py) с диска сервера. Идемпотентно
   *  по тексту вопроса: существующие вопросы не дублируются. */
  async importJsonl(path: string) {
    let imported = 0;
    let skipped = 0;
    const existing = new Set(
      (
        await this.prisma.evalQuestion.findMany({ select: { question: true } })
      ).map((q) => q.question),
    );

    let rl: ReturnType<typeof createInterface>;
    try {
      rl = createInterface({ input: createReadStream(path, "utf-8") });
    } catch (e) {
      throw new BadRequestException(`Ֆայլը չհաջողվեց բացել: ${e}`);
    }

    const rows: ImportedRow[] = [];
    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) rows.push(JSON.parse(trimmed) as ImportedRow);
      }
    } catch (e) {
      throw new BadRequestException(`Սխալ jsonl ֆորմատ: ${e}`);
    }

    for (const r of rows) {
      const q = (r.question ?? "").trim();
      if (!q || existing.has(q)) {
        skipped++;
        continue;
      }
      existing.add(q);
      await this.prisma.evalQuestion.create({
        data: {
          question: q,
          expectedAnswer: r.expected_answer ?? "",
          chunkId: r.chunk_id ?? null,
          documentId: r.document_id ?? null,
          mustRefuse: Boolean(r.must_refuse),
          kind: r.kind ?? "prose",
        },
      });
      imported++;
    }
    this.logger.log(`Импорт eval-датасета: +${imported}, пропущено ${skipped}.`);
    return { imported, skipped };
  }

  /** Экспорт approved-вопросов в jsonl (вход для eval/run_thresholds.py). */
  async exportApprovedJsonl(): Promise<string> {
    const rows = await this.prisma.evalQuestion.findMany({
      where: { status: EvalStatus.approved },
      orderBy: { createdAt: "asc" },
    });
    return rows
      .map((r) =>
        JSON.stringify({
          question: r.question,
          expected_answer: r.expectedAnswer,
          chunk_id: r.chunkId,
          document_id: r.documentId,
          must_refuse: r.mustRefuse,
          kind: r.kind,
        }),
      )
      .join("\n");
  }
}
