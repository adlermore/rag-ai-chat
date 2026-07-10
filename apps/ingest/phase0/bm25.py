"""
BM25 (Okapi) — самодостаточная pure-python реализация (без внешних зависимостей),
чтобы harness запускался и без установки rank-bm25. Токенизация — армянская
(tokenizer_hy). Для продакшена BM25 строится в ingest-сервисе (Фаза 2).
"""
from __future__ import annotations

import math
from collections import Counter

from tokenizer_hy import analyze


class BM25:
    def __init__(
        self,
        docs_tokens: list[list[str]],
        doc_ids: list[str],
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        if len(docs_tokens) != len(doc_ids):
            raise ValueError("docs_tokens и doc_ids должны совпадать по длине")
        self.doc_ids = doc_ids
        self.k1 = k1
        self.b = b
        self.docs = docs_tokens
        self.doc_len = [len(d) for d in docs_tokens]
        self.avgdl = (sum(self.doc_len) / len(docs_tokens)) if docs_tokens else 0.0
        self.freqs = [Counter(d) for d in docs_tokens]

        # document frequency -> idf
        df: Counter[str] = Counter()
        for tf in self.freqs:
            df.update(tf.keys())
        n = len(docs_tokens)
        self.idf = {
            term: math.log(1 + (n - dfi + 0.5) / (dfi + 0.5))
            for term, dfi in df.items()
        }

    @classmethod
    def from_texts(cls, texts: list[str], doc_ids: list[str]) -> "BM25":
        return cls([analyze(t) for t in texts], doc_ids)

    def _score(self, query_terms: list[str], idx: int) -> float:
        tf = self.freqs[idx]
        dl = self.doc_len[idx]
        score = 0.0
        for term in query_terms:
            if term not in tf:
                continue
            idf = self.idf.get(term, 0.0)
            f = tf[term]
            denom = f + self.k1 * (1 - self.b + self.b * dl / (self.avgdl or 1))
            score += idf * (f * (self.k1 + 1)) / (denom or 1)
        return score

    def search(self, query: str, top_k: int | None = None) -> list[str]:
        """Возвращает doc_id, отсортированные по убыванию BM25-score."""
        query_terms = analyze(query)
        scored = [(self.doc_ids[i], self._score(query_terms, i)) for i in range(len(self.docs))]
        scored = [(cid, s) for cid, s in scored if s > 0.0]
        scored.sort(key=lambda x: x[1], reverse=True)
        ids = [cid for cid, _ in scored]
        return ids[:top_k] if top_k else ids
