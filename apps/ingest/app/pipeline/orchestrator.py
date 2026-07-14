"""
Оркестратор ингестии: файл → чанки → эмбеддинги → Qdrant upsert + BM25-индекс.
Плюс гибридный поиск (dense + BM25 → RRF → rerank) — тот же путь, что валидирован
в Фазе 0; используется для верификации ингестии и переиспользуется в Фазе 3 (чат).

Модели (bge-m3, reranker) загружаются лениво и переиспользуются между вызовами.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..config import get_config
from .bm25 import BM25
from .embedders import Embedder, get_embedder
from .fusion import rrf_fuse
from .parsing import parse_document
from .reranker import Reranker, get_reranker
from .vectorstore import SearchHit, VectorStore


@dataclass
class IngestResult:
    document_id: str
    chunk_count: int
    collection: str


class IngestPipeline:
    def __init__(
        self,
        store: VectorStore | None = None,
        embedder: Embedder | None = None,
        reranker: Reranker | None = None,
        *,
        use_rerank: bool = True,
    ) -> None:
        self.cfg = get_config()
        self.store = store or VectorStore()
        self._embedder = embedder
        self._reranker = reranker
        self._use_rerank = use_rerank
        # In-memory тексты чанков для BM25 (перестраивается при изменении корпуса).
        self._texts: dict[str, str] = {}
        self._bm25: BM25 | None = None

    # ── ленивые модели ──
    @property
    def embedder(self) -> Embedder:
        if self._embedder is None:
            self._embedder = get_embedder()
        return self._embedder

    @property
    def reranker(self) -> Reranker:
        if self._reranker is None:
            self._reranker = get_reranker(self._use_rerank)
        return self._reranker

    def _rebuild_bm25(self) -> None:
        ids = list(self._texts)
        self._bm25 = BM25.from_texts([self._texts[i] for i in ids], ids)

    # ── ингестия ──
    def ingest_document(
        self,
        path: str,
        *,
        document_id: str,
        version: int = 1,
        doc_title: str | None = None,
        collection: str | None = None,
    ) -> IngestResult:
        collection = collection or self.cfg.collection
        self.store.ensure_collection(collection)

        chunks = parse_document(path, document_id=document_id, version=version)
        if not chunks:
            return IngestResult(document_id, 0, collection)

        vectors = self.embedder.embed([c.text for c in chunks])
        self.store.upsert(collection, chunks, vectors, doc_title=doc_title)

        for c in chunks:
            self._texts[c.id] = c.text
        self._rebuild_bm25()

        return IngestResult(document_id, len(chunks), collection)

    # ── поиск (dense + BM25 → RRF → rerank) ──
    def search(
        self, query: str, *, collection: str | None = None, top_out: int | None = None
    ) -> list[SearchHit]:
        collection = collection or self.cfg.collection
        top_out = top_out or self.cfg.top_out

        qvec = self.embedder.embed([query])[0]
        dense_hits = self.store.search(collection, qvec, limit=self.cfg.top_in)
        payload_by_id = {h.chunk_id: h.payload for h in dense_hits}
        dense_ids = [h.chunk_id for h in dense_hits]

        bm25_ids = self._bm25.search(query, top_k=self.cfg.top_in) if self._bm25 else []
        hybrid_ids = rrf_fuse([dense_ids, bm25_ids], k=self.cfg.rrf_k)

        # Реранкуем top_in кандидатов; тексты берём из payload (dense) или BM25-кэша.
        head = hybrid_ids[: self.cfg.top_in]
        cand_texts: list[tuple[str, str]] = []
        for cid in head:
            text = payload_by_id.get(cid, {}).get("text") or self._texts.get(cid, "")
            cand_texts.append((cid, text))
        ranked_ids = self.reranker.rerank(query, cand_texts)

        # Собираем итоговые хиты в порядке reranker (payload дотягиваем из Qdrant).
        out: list[SearchHit] = []
        for cid in ranked_ids[:top_out]:
            payload = payload_by_id.get(cid)
            if payload is None:
                # чанк пришёл только из BM25 — подтянем payload точечным поиском
                payload = {"text": self._texts.get(cid, "")}
            out.append(SearchHit(chunk_id=cid, score=0.0, payload=payload))
        return out
