"""
Qdrant-хранилище dense-векторов чанков.

Поддерживает:
  · создание коллекции нужной размерности (cosine);
  · upsert чанков с payload (document_id, version, page, sheet, row, text …);
  · dense-поиск (query_points);
  · удаление по document_id;
  · теневую замену документа: ингест в новую коллекцию + переключение alias
    (docs/04-ROADMAP.md, Фаза 2).

Локальный режим (QDRANT_PATH=":memory:" или путь) — для тестов/оффлайн без Docker.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from qdrant_client import QdrantClient, models

from ..config import get_config
from .models import Chunk


@dataclass
class SearchHit:
    chunk_id: str
    score: float
    payload: dict[str, Any]


class VectorStore:
    def __init__(self, client: QdrantClient | None = None) -> None:
        cfg = get_config()
        if client is not None:
            self.client = client
        elif cfg.qdrant_path:
            # in-process (":memory:" или путь на диске)
            loc = None if cfg.qdrant_path == ":memory:" else cfg.qdrant_path
            self.client = QdrantClient(
                location=":memory:" if cfg.qdrant_path == ":memory:" else None,
                path=loc,
            )
        else:
            self.client = QdrantClient(url=cfg.qdrant_url, api_key=cfg.qdrant_api_key)
        self.dim = cfg.embedding_dim

    def ensure_collection(self, name: str, *, recreate: bool = False) -> None:
        exists = self.client.collection_exists(name)
        if exists and recreate:
            self.client.delete_collection(name)
            exists = False
        if not exists:
            self.client.create_collection(
                collection_name=name,
                vectors_config=models.VectorParams(
                    size=self.dim, distance=models.Distance.COSINE
                ),
            )

    def upsert(
        self,
        name: str,
        chunks: list[Chunk],
        vectors: list[list[float]],
        *,
        doc_title: str | None = None,
        batch: int = 256,
    ) -> int:
        if len(chunks) != len(vectors):
            raise ValueError("chunks и vectors должны совпадать по длине")
        points = [
            models.PointStruct(
                id=c.id, vector=v, payload=c.payload(doc_title=doc_title)
            )
            for c, v in zip(chunks, vectors)
        ]
        for i in range(0, len(points), batch):
            self.client.upsert(collection_name=name, points=points[i : i + batch])
        return len(points)

    def search(self, name: str, query_vector: list[float], limit: int) -> list[SearchHit]:
        resp = self.client.query_points(
            collection_name=name, query=query_vector, limit=limit, with_payload=True
        )
        return [
            SearchHit(chunk_id=str(p.id), score=float(p.score), payload=p.payload or {})
            for p in resp.points
        ]

    def iter_chunks(self, name: str, *, batch: int = 500):
        """Обходит все точки коллекции, отдавая (chunk_id, document_id, text).

        Нужно для восстановления in-memory BM25 после рестарта контейнера —
        корпус живёт в Qdrant, а BM25-индекс держится только в памяти процесса.
        """
        offset = None
        while True:
            points, offset = self.client.scroll(
                collection_name=name,
                limit=batch,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for p in points:
                payload = p.payload or {}
                yield str(p.id), payload.get("document_id"), payload.get("text", "")
            if offset is None:
                break

    def delete_document(self, name: str, document_id: str) -> None:
        self.client.delete(
            collection_name=name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id),
                        )
                    ]
                )
            ),
        )

    def switch_alias(self, alias: str, to_collection: str) -> None:
        """Атомарно направляет alias на коллекцию (теневая замена)."""
        self.client.update_collection_aliases(
            change_aliases_operations=[
                models.CreateAliasOperation(
                    create_alias=models.CreateAlias(
                        collection_name=to_collection, alias_name=alias
                    )
                )
            ]
        )
