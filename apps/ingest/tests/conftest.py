"""
Общая настройка тестов ingest.

ВАЖНО: переменные окружения выставляются ДО импорта app.config — дефолты Config
связываются при определении класса (импорт модуля). Тесты используют локальный
Qdrant (:memory:), чтобы не требовать Docker.
"""
from __future__ import annotations

import hashlib
import math
import os

os.environ.setdefault("QDRANT_PATH", ":memory:")
os.environ.setdefault("EMBEDDING_MODEL", "bge-m3")  # dim 1024


class FakeEmbedder:
    """Детерминированный hashing-эмбеддер (1024-мерн., как bge-m3) — без моделей.

    Даёт осмысленную лексическую близость (bag-of-words по армянским токенам),
    достаточную, чтобы проверить весь конвейер ингестии и поиска.
    """

    name = "fake-1024"
    dim = 1024

    def _bucket(self, token: str) -> int:
        return int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % self.dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        from app.pipeline.tokenizer_hy import analyze

        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            for tok in analyze(text):
                vec[self._bucket(tok)] += 1.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out
