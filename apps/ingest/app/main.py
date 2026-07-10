"""
Ingest-сервис (Python FastAPI) — ЗАГЛУШКА-КАРКАС (Фаза 1).

В Фазе 1 сервис содержит только health-эндпоинт и структуру проекта.
Логика (Docling-парсинг PDF/DOCX/XLSX, semantic chunking, embeddings,
Qdrant upsert, BM25-индекс, reranker) добавляется в Фазе 2 — которая
ЗАБЛОКИРОВАНА Фазой 0 (проверка армянского retrieval). См. docs/04-ROADMAP.md.
"""
from fastapi import FastAPI

app = FastAPI(
    title="RAG Ingest Service",
    version="0.1.0",
    description="Docling parsing, chunking, embeddings (наполняется в Фазе 2)",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ingest", "phase": "1-scaffold"}
