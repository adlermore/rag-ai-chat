"""Метрики retrieval Фазы 0: recall@k, MRR и проверка критерия выхода."""
from __future__ import annotations

from dataclasses import dataclass


def rank_of_target(ranked_ids: list[str], target_id: str) -> int | None:
    """Позиция целевого чанка (1-индексация) или None, если его нет в списке."""
    for i, cid in enumerate(ranked_ids, start=1):
        if cid == target_id:
            return i
    return None


def recall_at_k(ranks: list[int | None], k: int) -> float:
    """Доля вопросов, у которых целевой чанк попал в top-k."""
    if not ranks:
        return 0.0
    hits = sum(1 for r in ranks if r is not None and r <= k)
    return hits / len(ranks)


def mrr(ranks: list[int | None]) -> float:
    """Mean Reciprocal Rank."""
    if not ranks:
        return 0.0
    return sum((1.0 / r) if r else 0.0 for r in ranks) / len(ranks)


@dataclass
class MethodReport:
    """Агрегированный результат одного метода retrieval (напр. 'hybrid+rerank')."""

    name: str
    n_questions: int
    recall: dict[int, float]  # k -> recall@k
    mrr: float

    def recall_line(self, ks: tuple[int, ...]) -> str:
        parts = [f"R@{k}={self.recall.get(k, 0.0):.3f}" for k in ks]
        return f"{self.name:<28} " + "  ".join(parts) + f"  MRR={self.mrr:.3f}"


def build_report(
    name: str, ranks: list[int | None], recall_ks: tuple[int, ...]
) -> MethodReport:
    return MethodReport(
        name=name,
        n_questions=len(ranks),
        recall={k: recall_at_k(ranks, k) for k in recall_ks},
        mrr=mrr(ranks),
    )


def passes_exit_criterion(
    report: MethodReport, at_k: int, threshold: float
) -> bool:
    """hybrid+rerank recall@5 >= 0.85 (docs/04-ROADMAP.md)."""
    return report.recall.get(at_k, 0.0) >= threshold
