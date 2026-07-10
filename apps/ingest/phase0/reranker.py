"""
Reranker bge-reranker-v2-m3 (мультиязычный, self-hosted CPU).

Задача Фазы 0: проверить, осмыслен ли порядок top-5 на армянском.
Без установленной FlagEmbedding используется IdentityReranker (порядок кандидатов
не меняется) — чтобы harness прогонялся; в отчёте это явно помечается.
"""
from __future__ import annotations

from typing import Protocol

from config import CONFIG


class Reranker(Protocol):
    name: str

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        """candidates: [(chunk_id, text)] → chunk_id, отсортированные по релевантности."""
        ...


class IdentityReranker:
    """Заглушка: сохраняет исходный порядок (когда модель не установлена)."""

    name = "identity(no-rerank)"

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        return [cid for cid, _ in candidates]


class BgeReranker:
    """bge-reranker-v2-m3 через FlagEmbedding.FlagReranker."""

    def __init__(self, model: str | None = None) -> None:
        self.name = model or CONFIG.reranker_model
        from FlagEmbedding import FlagReranker  # ленивый импорт

        self._model = FlagReranker(self.name, use_fp16=False)

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        if not candidates:
            return []
        pairs = [[query, text] for _, text in candidates]
        scores = self._model.compute_score(pairs, normalize=True)
        if not isinstance(scores, list):
            scores = [scores]
        order = sorted(
            range(len(candidates)), key=lambda i: scores[i], reverse=True
        )
        return [candidates[i][0] for i in order]


def get_reranker(use_model: bool) -> Reranker:
    """use_model=True → пытается загрузить bge-reranker; иначе Identity."""
    if not use_model:
        return IdentityReranker()
    try:
        return BgeReranker()
    except ImportError:
        print("⚠️  FlagEmbedding не установлен — reranker отключён (IdentityReranker).")
        return IdentityReranker()
