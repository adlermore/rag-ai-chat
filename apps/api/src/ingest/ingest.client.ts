import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Agent, fetch as undiciFetch } from "undici";

// Ингестия большого PDF занимает десятки минут (CPU) — дефолтные таймауты
// undici (~5 мин на заголовки) роняли fetch, документ помечался failed, а
// ingest продолжал работать «осиротевшим» (найдено на Трудовом кодексе).
// До перевода на BullMQ (v1.1) держим соединение без лимитов.
const LONG_RUNNING_AGENT = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
});

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  collection: string;
}

export interface RetrievalHit {
  chunkId: string;
  score: number;
  text: string;
  documentId: string | null;
  docTitle: string | null;
  page: number | null;
  sheet: string | null;
  row: number | null;
}

/** HTTP-клиент к Python ingest-сервису (парсинг/эмбеддинги/поиск). */
@Injectable()
export class IngestClient {
  private readonly logger = new Logger(IngestClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("INGEST_URL", "http://localhost:8000");
  }

  async ingestPath(params: {
    path: string;
    documentId: string;
    version: number;
    title: string;
  }): Promise<IngestResult> {
    // fetch из npm-undici: встроенному fetch нельзя передать Agent из npm-копии
    // (разные внутренние инстансы undici → мгновенный «fetch failed»).
    const resp = await undiciFetch(`${this.baseUrl}/ingest-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: params.path,
        document_id: params.documentId,
        version: params.version,
        title: params.title,
      }),
      dispatcher: LONG_RUNNING_AGENT,
    });
    if (!resp.ok) {
      throw new Error(`ingest /ingest-path ${resp.status}: ${await resp.text()}`);
    }
    const d = (await resp.json()) as {
      document_id: string;
      chunk_count: number;
      collection: string;
    };
    return {
      documentId: d.document_id,
      chunkCount: d.chunk_count,
      collection: d.collection,
    };
  }

  async deleteDocument(documentId: string): Promise<void> {
    const resp = await fetch(
      `${this.baseUrl}/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" },
    );
    if (!resp.ok) {
      throw new Error(`ingest DELETE /documents ${resp.status}: ${await resp.text()}`);
    }
  }

  async search(query: string, top: number): Promise<RetrievalHit[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&top=${top}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`ingest /search ${resp.status}: ${await resp.text()}`);
    }
    const hits = (await resp.json()) as Array<{
      chunk_id: string;
      score: number;
      text: string;
      document_id: string | null;
      doc_title: string | null;
      page: number | null;
      sheet: string | null;
      row: number | null;
    }>;
    return hits.map((h) => ({
      chunkId: h.chunk_id,
      score: h.score,
      text: h.text,
      documentId: h.document_id,
      docTitle: h.doc_title,
      page: h.page,
      sheet: h.sheet,
      row: h.row,
    }));
  }
}
