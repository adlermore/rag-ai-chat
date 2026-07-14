"""
Ingest-сервис (Python FastAPI) — Фаза 2.

Ядро (валидировано в Фазе 0): Docling-парсинг PDF/DOCX/XLSX → чанкинг →
эмбеддинги bge-m3 → Qdrant upsert + BM25 → гибридный поиск с reranker.

Пока НЕ подключено (ждёт Docker/инфраструктуру): BullMQ-очередь и SSE-статусы,
Postgres, MinIO, интеграция с NestJS-api. Эндпоинты здесь — синхронные.
"""
from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .config import get_config
from .pipeline.orchestrator import IngestPipeline

app = FastAPI(
    title="RAG Ingest Service",
    version="0.2.0",
    description="Docling parsing, chunking, embeddings, Qdrant + BM25 (Фаза 2)",
)

# Пайплайн-синглтон: модели (bge-m3, reranker) грузятся лениво и переиспользуются.
_pipeline: IngestPipeline | None = None


def pipeline() -> IngestPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = IngestPipeline()
    return _pipeline


class IngestResponse(BaseModel):
    document_id: str
    chunk_count: int
    collection: str


class SearchHitDTO(BaseModel):
    chunk_id: str
    text: str
    document_id: str | None = None
    page: int | None = None
    sheet: str | None = None
    row: int | None = None


@app.get("/health")
def health() -> dict[str, str]:
    cfg = get_config()
    return {
        "status": "ok",
        "service": "ingest",
        "phase": "2-core",
        "embedding_model": cfg.embedding_model,
    }


_SUPPORTED_SUFFIX = {".pdf", ".docx", ".xlsx"}


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile,
    document_id: str | None = Form(default=None),
    version: int = Form(default=1),
    title: str | None = Form(default=None),
) -> IngestResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _SUPPORTED_SUFFIX:
        raise HTTPException(400, f"Неподдерживаемый формат: {suffix or '—'}")

    doc_id = document_id or str(uuid.uuid4())
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(await file.read())
        tmp.flush()
        try:
            result = pipeline().ingest_document(
                tmp.name,
                document_id=doc_id,
                version=version,
                doc_title=title or file.filename,
            )
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Ошибка ингестии: {e}") from e

    return IngestResponse(
        document_id=result.document_id,
        chunk_count=result.chunk_count,
        collection=result.collection,
    )


@app.get("/search", response_model=list[SearchHitDTO])
def search(q: str, top: int = 5) -> list[SearchHitDTO]:
    """Гибридный поиск (dense + BM25 → RRF → rerank). Для проверки/демо ингестии."""
    hits = pipeline().search(q, top_out=top)
    return [
        SearchHitDTO(
            chunk_id=h.chunk_id,
            text=h.payload.get("text", ""),
            document_id=h.payload.get("document_id"),
            page=h.payload.get("page"),
            sheet=h.payload.get("sheet"),
            row=h.payload.get("row"),
        )
        for h in hits
    ]
