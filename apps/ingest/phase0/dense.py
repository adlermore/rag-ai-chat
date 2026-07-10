"""
Плотный (dense) поиск по эмбеддингам — pure-python косинусная близость.
Масштаб Фазы 0 (50–80 чанков) не требует Qdrant; в проде dense-поиск — Qdrant.
"""
from __future__ import annotations

import math


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


class DenseIndex:
    def __init__(self, doc_ids: list[str], vectors: list[list[float]]) -> None:
        if len(doc_ids) != len(vectors):
            raise ValueError("doc_ids и vectors должны совпадать по длине")
        self.doc_ids = doc_ids
        self.vectors = vectors

    def search(self, query_vector: list[float], top_k: int | None = None) -> list[str]:
        """doc_id, отсортированные по убыванию косинусной близости к запросу."""
        scored = [
            (self.doc_ids[i], _cosine(query_vector, self.vectors[i]))
            for i in range(len(self.vectors))
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        ids = [cid for cid, _ in scored]
        return ids[:top_k] if top_k else ids
