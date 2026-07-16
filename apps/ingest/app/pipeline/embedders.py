"""
Эмбеддеры. Основной (Фаза 0): self-hosted bge-m3 (dim 1024, CPU, бесплатен).
Опционально: OpenAI text-embedding-3-large (dim 3072). Тяжёлые импорты — лениво.
"""
from __future__ import annotations

from typing import Protocol

from ..config import get_config


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]:
        ...


class BgeM3Embedder:
    """BAAI/bge-m3 dense, CPU. Требует FlagEmbedding + torch."""

    dim = 1024

    def __init__(self) -> None:
        cfg = get_config()
        self.name = "BAAI/bge-m3"
        from FlagEmbedding import BGEM3FlagModel  # ленивый импорт

        import os

        import torch

        # CPU принудительно (прод — без GPU; MPS на Mac падает по памяти).
        # Мелкий батч: крупный на CPU паддится до самой длинной последовательности.
        torch.set_num_threads(os.cpu_count() or 4)
        self._model = BGEM3FlagModel(
            self.name, use_fp16=False, devices=cfg.device, batch_size=cfg.embed_batch
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        result = self._model.encode(texts, return_dense=True)["dense_vecs"]
        return [list(map(float, v)) for v in result]


class OpenAIEmbedder:
    """text-embedding-3-large. Требует OPENAI_API_KEY (опциональный путь)."""

    dim = 3072

    def __init__(self) -> None:
        cfg = get_config()
        self.name = "text-embedding-3-large"
        from openai import OpenAI  # ленивый импорт

        if not cfg.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY не задан.")
        self._client = OpenAI(api_key=cfg.openai_api_key)

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 128):
            resp = self._client.embeddings.create(model=self.name, input=texts[i : i + 128])
            out.extend(item.embedding for item in resp.data)
        return out


def get_embedder(model: str | None = None) -> Embedder:
    key = (model or get_config().embedding_model).lower()
    if key in ("bge-m3", "baai/bge-m3"):
        return BgeM3Embedder()
    if key in ("openai", "text-embedding-3-large", "3-large"):
        return OpenAIEmbedder()
    raise ValueError(f"Неизвестный эмбеддер: {model} (bge-m3 | openai)")
