# apps/ingest — Python FastAPI (Docling, chunking, embeddings)

> ⚠️ **Фаза 1 — только каркас.** Здесь пока лишь `/health` и структура проекта.
> Реальная логика ингестии добавляется в **Фазе 2**, которая заблокирована
> **Фазой 0** (проверка армянского retrieval, recall@5 ≥ 0.85). См. `docs/04-ROADMAP.md`.

## Что появится в Фазе 2

Docling-парсинг PDF/DOCX/XLSX → semantic chunking (Excel: строка + шапка + лист) →
embeddings батчами (`text-embedding-3-large`) → Qdrant upsert + BM25-индекс →
reranker `bge-reranker-v2-m3` (CPU). Статусы задач — через BullMQ/Redis, прогресс — SSE в админку.

## Локальный запуск (каркас)

```bash
cd apps/ingest
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# проверка:
curl http://localhost:8000/health
```

## Docker

```bash
docker build -t rag-ingest apps/ingest
docker run -p 8000:8000 rag-ingest
```
