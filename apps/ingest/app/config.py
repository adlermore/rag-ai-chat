"""
Конфигурация ingest-сервиса (Фаза 2). Все параметры — через env с дефолтами,
выверенными в Фазе 0 (см. docs/02-ARCHITECTURE.md, таблица «Армянский язык»).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

try:  # .env необязателен (в контейнере переменные приходят из окружения)
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass

# Размерность dense-вектора по модели эмбеддинга (для создания коллекции Qdrant).
_EMBEDDING_DIMS: dict[str, int] = {
    "bge-m3": 1024,
    "BAAI/bge-m3": 1024,
    "text-embedding-3-large": 3072,
    "text-embedding-3-small": 1536,
}


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


@dataclass(frozen=True)
class Config:
    # ── Эмбеддинги / reranker (Фаза 0: bge-m3 валидирован, dim 1024) ──
    embedding_model: str = os.environ.get("EMBEDDING_MODEL", "bge-m3")
    reranker_model: str = os.environ.get("RERANKER_MODEL", "bge-reranker-v2-m3")
    # CPU принудительно: целевая среда — сервер без GPU (MPS на Mac падает по памяти).
    device: str = os.environ.get("INGEST_DEVICE", "cpu")
    embed_batch: int = _int("EMBED_BATCH", 16)

    # ── Чанкинг (300–600 токенов, overlap 15%; размер меряется токенайзером
    # модели эмбеддинга — cl100k переоценивает армянский, см. Фазу 0) ──
    chunk_target_tokens: int = _int("CHUNK_TOKENS", 450)
    chunk_overlap_ratio: float = _float("CHUNK_OVERLAP", 0.15)

    # ── Retrieval ──
    top_in: int = _int("RERANK_TOP_IN", 20)     # кандидатов в reranker
    top_out: int = _int("RERANK_TOP_OUT", 5)    # после reranker
    rrf_k: int = _int("RRF_K", 60)

    # ── Qdrant ──
    qdrant_url: str = os.environ.get("QDRANT_URL", "http://localhost:6333")
    qdrant_api_key: str | None = os.environ.get("QDRANT_API_KEY") or None
    # Локальный путь Qdrant (in-process) — если задан, используется вместо URL
    # (удобно для тестов/оффлайн-прогона без Docker: см. QDRANT_PATH=":memory:").
    qdrant_path: str | None = os.environ.get("QDRANT_PATH") or None
    collection: str = os.environ.get("QDRANT_COLLECTION", "chunks")
    collection_alias: str = os.environ.get("QDRANT_ALIAS", "chunks_live")

    # ── Ключи (OpenAI-путь опционален) ──
    openai_api_key: str | None = os.environ.get("OPENAI_API_KEY") or None

    @property
    def embedding_dim(self) -> int:
        if self.embedding_model in _EMBEDDING_DIMS:
            return _EMBEDDING_DIMS[self.embedding_model]
        raise ValueError(
            f"Неизвестная размерность для модели {self.embedding_model!r}; "
            f"добавьте её в _EMBEDDING_DIMS."
        )


@lru_cache
def get_config() -> Config:
    return Config()
