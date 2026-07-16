"""
Конфигурация harness'а Фазы 0 (проверка армянского retrieval).

Все параметры — через переменные окружения с дефолтами. Ключи API нужны только
для реальных embeddings/генерации вопросов; smoke-тест на фикстурах работает без них.

Критерий выхода Фазы 0 (docs/04-ROADMAP.md): hybrid + rerank даёт
recall@5 >= 0.85 на тестовых армянских вопросах.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Windows-консоль по умолчанию cp1252 и падает на армянском/юникоде — форсируем UTF-8.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent

# Ключи и параметры прогона берутся из apps/ingest/phase0/.env (в .gitignore).
# Грузим до чтения os.environ ниже; без python-dotenv (smoke-тест) — пропускаем.
try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env")
except Exception:
    pass

DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"           # сюда кладут документы заказчика
FIXTURES_DIR = DATA_DIR / "fixtures"  # синтетические данные для smoke-теста
REPORTS_DIR = BASE_DIR / "reports"

CHUNKS_PATH = DATA_DIR / "chunks.jsonl"
QUESTIONS_PATH = DATA_DIR / "questions.jsonl"


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


@dataclass(frozen=True)
class Config:
    # Чанкинг (docs/02-ARCHITECTURE.md: 300–600 токенов, overlap 15%).
    chunk_target_tokens: int = _int("PHASE0_CHUNK_TOKENS", 450)
    chunk_overlap_ratio: float = _float("PHASE0_CHUNK_OVERLAP", 0.15)

    # Кандидаты retrieval и reranker.
    top_in: int = _int("RERANK_TOP_IN", 20)     # сколько кандидатов подаём в reranker
    top_out: int = _int("RERANK_TOP_OUT", 5)    # сколько остаётся после reranker
    rrf_k: int = _int("PHASE0_RRF_K", 60)       # константа RRF-слияния

    # На каких k считаем recall.
    recall_at: tuple[int, ...] = field(default_factory=lambda: (1, 5, 10))

    # Критерий выхода.
    exit_recall_at: int = _int("PHASE0_EXIT_RECALL_AT", 5)
    exit_threshold: float = _float("PHASE0_EXIT_THRESHOLD", 0.85)

    # Модели (реальные прогоны).
    openai_embedding_model: str = os.environ.get(
        "EMBEDDING_MODEL", "text-embedding-3-large"
    )
    bge_m3_model: str = os.environ.get("BGE_M3_MODEL", "BAAI/bge-m3")
    reranker_model: str = os.environ.get(
        "RERANKER_MODEL", "BAAI/bge-reranker-v2-m3"
    )

    # Генерация вопросов.
    qgen_provider: str = os.environ.get("LLM_PROVIDER", "openai")
    qgen_model: str = os.environ.get("LLM_MODEL", "gpt-4.1-mini")
    qgen_sample_ratio: float = _float("PHASE0_QGEN_SAMPLE", 0.20)  # 15–25% чанков
    qgen_trap_count: int = _int("PHASE0_QGEN_TRAPS", 35)          # вопросы-ловушки

    openai_api_key: str | None = os.environ.get("OPENAI_API_KEY")
    anthropic_api_key: str | None = os.environ.get("ANTHROPIC_API_KEY")


CONFIG = Config()
