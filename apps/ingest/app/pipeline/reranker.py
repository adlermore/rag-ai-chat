"""
Reranker bge-reranker-v2-m3 (мультиязычный, CPU). Подтверждён в Фазе 0
(+0.12 R@1, +0.10 MRR). Без FlagEmbedding — IdentityReranker (порядок сохраняется).
"""
from __future__ import annotations

from typing import Protocol

from ..config import get_config


class Reranker(Protocol):
    name: str

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        ...


class IdentityReranker:
    name = "identity(no-rerank)"

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        return [cid for cid, _ in candidates]


class BgeReranker:
    """bge-reranker-v2-m3 через FlagEmbedding.FlagReranker (CPU)."""

    def __init__(self) -> None:
        cfg = get_config()
        self.name = "BAAI/bge-reranker-v2-m3"
        from FlagEmbedding import FlagReranker  # ленивый импорт

        self._model = FlagReranker(self.name, use_fp16=False, devices=cfg.device)

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        if not candidates:
            return []
        pairs = [[query, text] for _, text in candidates]
        scores = self._model.compute_score(pairs, normalize=True)
        if not isinstance(scores, list):
            scores = [scores]
        order = sorted(range(len(candidates)), key=lambda i: scores[i], reverse=True)
        return [candidates[i][0] for i in order]


def get_reranker(use_model: bool = True) -> Reranker:
    if not use_model:
        return IdentityReranker()
    try:
        return BgeReranker()
    except ImportError:
        return IdentityReranker()
