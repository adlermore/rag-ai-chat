# apps/ingest — Python FastAPI (Docling, chunking, embeddings)

Продовый сервис ингестии. Ядро выверено в Фазе 0 (`apps/ingest/phase0`) на реальных
армянских документах: hybrid+rerank recall@5 = 0.96 (docs/02-ARCHITECTURE.md).

## Статус (Фаза 2)

**Готово (ядро, проверяется без Docker):**
- `app/pipeline/` — парсинг PDF/DOCX (Docling) и XLSX (openpyxl, построчно:
  строка + шапка + лист), чанкинг (300–600 токенов bge-m3, overlap 15%),
  эмбеддинги `bge-m3` (CPU), BM25 (армянская токенизация), RRF-слияние,
  reranker `bge-reranker-v2-m3` (CPU).
- `app/pipeline/vectorstore.py` — Qdrant (dim 1024, cosine): upsert, поиск,
  удаление по документу, alias для теневой замены. Локальный режим
  (`QDRANT_PATH=:memory:`/путь) — для тестов/оффлайн.
- FastAPI: `POST /ingest` (загрузка файла), `GET /search` (гибридный поиск), `/health`.
- Тесты: `tests/` (unit-чанкинг + интеграция на qdrant `:memory:`).

**Открытые хвосты (следующие инкременты):**
- **Гранулярность таблиц:** большие таблицы (напр. суточные по странам) режутся
  на чанки с десятками строк → поиск по одной ячейке («суточные Москва») может не
  поднять нужную строку. План: резать markdown-таблицы построчно, как Excel.
- Точные номера страниц из Docling (сейчас `page=None` для PDF/DOCX).
- BullMQ-очередь + SSE-статусы, Postgres (статусы документов), MinIO (файлы),
  интеграция с NestJS-api, админка Documents — **ждут установки Docker**.
- Полноценный армянский стеммер вместо заглушки (`tokenizer_hy.py`).

## Локальный запуск

```bash
cd apps/ingest
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# оффлайн, без Docker (Qdrant в процессе):
QDRANT_PATH=:memory: uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
# с Docker-инфраструктурой:
#   docker compose -f ../../docker/docker-compose.yml up -d qdrant
#   uvicorn app.main:app --reload --port 8000
```

## Тесты

```bash
cd apps/ingest
PYTHONPATH=. pytest tests/ -q
```

## Docker

```bash
docker build -t rag-ingest apps/ingest
docker run -p 8000:8000 rag-ingest
```
