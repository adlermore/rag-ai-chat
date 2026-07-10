# Phase 0 — harness проверки армянского retrieval

> **Блокирующая фаза** (docs/04-ROADMAP.md). Снимает главный риск проекта:
> работает ли retrieval-стек на армянском. **Пока Фаза 0 не пройдена — Фаза 2
> (продовая ингестия) не начинается.**
>
> **Критерий выхода:** `hybrid + rerank` даёт **recall@5 ≥ 0.85** на тестовых
> армянских вопросах.

Это **каркас**: ядро (метрики, RRF, BM25, dense-cosine) — pure-python и работает
уже сейчас. Тяжёлые интеграции (Docling, OpenAI, bge-m3, bge-reranker-v2-m3)
подключаются, когда появятся реальные документы и ключи API.

## Что сравниваем

| Ось сравнения | Варианты |
|---|---|
| Embeddings | `text-embedding-3-large` (OpenAI) **vs** `bge-m3` (self-hosted) |
| Методы retrieval | `dense` · `bm25` (арм. стеммер) · `hybrid` (RRF) · `hybrid+rerank` |
| Reranker | `bge-reranker-v2-m3` (вкл/выкл) |

Метрики: **recall@1/5/10**, **MRR** (см. `metrics.py`, docs/05-EVALUATION.md).

## Быстрый старт — smoke-тест (без документов и ключей)

Прогоняет весь конвейер на армянских фикстурах с детерминированным `dummy`-эмбеддером:

```bash
cd apps/ingest/phase0
python run_all.py --use-fixtures
# → data/chunks.jsonl, data/questions.jsonl, reports/phase0_report.md
```

## Реальный прогон (когда появятся документы)

```bash
# 0) зависимости
pip install -r requirements-phase0.txt
# ключи в окружении: OPENAI_API_KEY (+ при необходимости ANTHROPIC_API_KEY)

# 1) положить 3–5 армянских документов заказчика в data/raw/  (.pdf/.docx/.xlsx)

# 2) ингестия (Docling → 50–80 чанков)
python 01_ingest.py

# 3) генерация тестовых вопросов (LLM, армянский) + вопросы-ловушки
python 02_generate_questions.py
#    → далее ручной review approve/reject (админка, Фаза 4)

# 4) прогон и сравнение
python 03_run_eval.py --embedders openai,bge-m3 --rerank
```

Отчёт с таблицами recall и вердиктом по критерию выхода — в `reports/phase0_report.md`.

## Структура

```
config.py            параметры (пороги, top_in/out, RRF k, критерий выхода)
common.py            модели данных (Chunk, Question) + JSONL I/O
chunking.py          структурный чанкинг (300–600 токенов, overlap 15%) + Excel-строка
docling_ingest.py    Docling-обёртка (ленивый импорт)
tokenizer_hy.py      армянская токенизация + СТАБ стеммера (заменить на Snowball hy)
bm25.py              BM25 Okapi (pure-python)
embedders.py         Dummy / OpenAI / bge-m3 (ленивые импорты)
dense.py             dense-поиск (косинус, pure-python)
fusion.py            RRF-слияние
reranker.py          bge-reranker-v2-m3 (+ IdentityReranker fallback)
metrics.py           recall@k, MRR, проверка критерия выхода
qgen.py              LLM-генерация вопросов (ленивый импорт)
01_ingest.py · 02_generate_questions.py · 03_run_eval.py · run_all.py
data/fixtures/       армянские sample_chunks / sample_questions (для smoke-теста)
```

## После прогона

Зафиксировать решение (какая embedding-модель, нужен ли BM25, помогает ли reranker)
в `docs/02-ARCHITECTURE.md` (таблица «Армянский язык»). Только после выполнения
критерия выхода начинается **Фаза 2**.

## Известные упрощения каркаса (доработать по факту)

- Стеммер `tokenizer_hy.py` — отсечение частых суффиксов; заменить на полноценный
  армянский анализатор и сравнить recall.
- `docling_ingest.py` не выделяет точные номера страниц и таблицы — уточняется в Фазе 2.
- `dummy`-эмбеддер — только для smoke-теста, не для выводов о качестве.
