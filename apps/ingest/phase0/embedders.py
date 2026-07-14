"""
Эмбеддеры для сравнения (главный вопрос Фазы 0):
  - "openai"  → text-embedding-3-large (мультиязычная; основной кандидат)
  - "bge-m3"  → BAAI/bge-m3 (self-hosted fallback)
  - "dummy"   → детерминированный hashing-эмбеддер БЕЗ API/моделей,
                для smoke-теста harness'а на фикстурах.

Тяжёлые зависимости (openai, FlagEmbedding) импортируются лениво — harness
запускается с "dummy" без их установки.
"""
from __future__ import annotations

import hashlib
import math
from typing import Protocol

from config import CONFIG
from tokenizer_hy import analyze


class Embedder(Protocol):
    name: str

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class DummyEmbedder:
    """
    Hashing-эмбеддер: слова армянского текста хешируются в bag-of-words вектор
    с L2-нормализацией. Не заменяет реальную модель, но даёт осмысленную
    лексическую близость — достаточно, чтобы прогнать весь конвейер на фикстурах.
    """

    name = "dummy"

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    def _bucket(self, token: str) -> int:
        h = hashlib.md5(token.encode("utf-8")).hexdigest()
        return int(h, 16) % self.dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            for tok in analyze(text):
                vec[self._bucket(tok)] += 1.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


class OpenAIEmbedder:
    """text-embedding-3-large через OpenAI API. Требует OPENAI_API_KEY."""

    def __init__(self, model: str | None = None) -> None:
        self.name = model or CONFIG.openai_embedding_model
        try:
            from openai import OpenAI  # ленивый импорт
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "Установите зависимости: pip install -r requirements-phase0.txt"
            ) from e
        if not CONFIG.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY не задан (см. .env).")
        self._client = OpenAI(api_key=CONFIG.openai_api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        # Батчами, чтобы не упереться в лимиты запроса.
        for i in range(0, len(texts), 128):
            batch = texts[i : i + 128]
            resp = self._client.embeddings.create(model=self.name, input=batch)
            out.extend(item.embedding for item in resp.data)
        return out


class BgeM3Embedder:
    """BAAI/bge-m3 (self-hosted, dense-вектор). Требует FlagEmbedding + torch."""

    def __init__(self, model: str | None = None) -> None:
        self.name = model or CONFIG.bge_m3_model
        try:
            from FlagEmbedding import BGEM3FlagModel  # ленивый импорт
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "Установите зависимости: pip install -r requirements-phase0.txt"
            ) from e
        # Форсируем CPU: целевая среда — сервер без GPU (docs/02-ARCHITECTURE.md,
        # «self-hosted CPU»), а на Apple Silicon MPS падает по нехватке памяти при
        # батч-эмбеддинге. CPU-прогон также репрезентативен для прода.
        # batch_size=16: на CPU крупный батч (128) паддится до самой длинной
        # последовательности → тяжёлый forward; мелкий батч заметно быстрее.
        import os as _os

        import torch as _torch

        _torch.set_num_threads(_os.cpu_count() or 4)
        self._model = BGEM3FlagModel(
            self.name, use_fp16=False, devices="cpu", batch_size=16
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        result = self._model.encode(texts, return_dense=True)["dense_vecs"]
        return [list(map(float, v)) for v in result]


def get_embedder(name: str) -> Embedder:
    key = name.lower()
    if key == "dummy":
        return DummyEmbedder()
    if key in ("openai", "text-embedding-3-large", "3-large"):
        return OpenAIEmbedder()
    if key in ("bge-m3", "bge", "baai/bge-m3"):
        return BgeM3Embedder()
    raise ValueError(f"Неизвестный эмбеддер: {name} (openai | bge-m3 | dummy)")
