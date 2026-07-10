"""Reciprocal Rank Fusion (RRF) — слияние ранжирований dense и BM25."""
from __future__ import annotations


def rrf_fuse(
    ranked_lists: list[list[str]], k: int = 60
) -> list[str]:
    """
    Сливает несколько ранжированных списков chunk_id в один по формуле RRF:
        score(d) = Σ 1 / (k + rank_i(d)),  rank начинается с 1.

    Возвращает chunk_id, отсортированные по убыванию суммарного score.
    """
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda c: scores[c], reverse=True)
