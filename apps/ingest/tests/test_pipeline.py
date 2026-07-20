"""
Интеграция ингестии на локальном Qdrant (:memory:) с fake-эмбеддером —
без Docker и без тяжёлых моделей. Проверяет весь путь:
parse(xlsx) → chunk → embed → Qdrant upsert → hybrid search (dense+BM25→RRF→rerank).
"""
from __future__ import annotations

from pathlib import Path

from conftest import FakeEmbedder

from app.pipeline.orchestrator import IngestPipeline
from app.pipeline.reranker import IdentityReranker
from app.pipeline.vectorstore import VectorStore


def _make_xlsx(path: Path) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Սակագներ"
    ws.append(["Նահանգ", "Ամսական վճար"])
    ws.append(["Տեխաս", "120 դոլար"])
    ws.append(["Կալիֆոռնիա", "200 դոլար"])
    ws.append(["Նյու Յորք", "175 դոլար"])
    wb.save(str(path))


def _pipeline() -> IngestPipeline:
    return IngestPipeline(
        store=VectorStore(),           # :memory: из QDRANT_PATH (conftest)
        embedder=FakeEmbedder(),
        reranker=IdentityReranker(),
    )


def test_ingest_xlsx_and_retrieve_target_row(tmp_path: Path) -> None:
    xlsx = tmp_path / "tariffs.xlsx"
    _make_xlsx(xlsx)

    pipe = _pipeline()
    result = pipe.ingest_document(str(xlsx), document_id="tariffs", version=1,
                                 doc_title="Սակագներ")
    assert result.chunk_count == 3  # 3 строки данных (шапка не в счёт)

    # Запрос про Калифорнию → верхний результат должен быть строкой Калифорнии.
    hits = pipe.search("Կալիֆոռնիա նահանգի ամսական վճարը", top_out=3)
    assert hits, "поиск должен что-то вернуть"
    assert "Կալիֆոռնիա" in hits[0].payload.get("text", "")
    # Метаданные источника доезжают в payload (лист + строка для цитаты).
    assert hits[0].payload.get("sheet") == "Սակագներ"
    assert hits[0].payload.get("row") == 3


def test_bm25_restored_from_store_after_restart(tmp_path: Path) -> None:
    """Рестарт контейнера обнуляет in-memory BM25; restore_from_store поднимает
    корпус обратно из Qdrant, и keyword-путь снова работает (без ре-эмбеддинга)."""
    xlsx = tmp_path / "tariffs.xlsx"
    _make_xlsx(xlsx)
    store = VectorStore()  # общий :memory: клиент — переживает "рестарт" пайплайна
    pipe = IngestPipeline(store=store, embedder=FakeEmbedder(),
                          reranker=IdentityReranker())
    pipe.ingest_document(str(xlsx), document_id="tariffs", version=1)

    # Новый пайплайн на том же Qdrant = свежий процесс: тексты/BM25 пусты.
    fresh = IngestPipeline(store=store, embedder=FakeEmbedder(),
                           reranker=IdentityReranker())
    assert fresh._bm25 is None
    restored = fresh.restore_from_store()
    assert restored == 3
    assert fresh._doc_chunks.get("tariffs")
    hits = fresh.search("Կալիֆոռնիա նահանգի ամսական վճարը", top_out=3)
    assert hits and "Կալիֆոռնիա" in hits[0].payload.get("text", "")


def test_supported_formats_rejected(tmp_path: Path) -> None:
    import pytest

    bad = tmp_path / "note.txt"
    bad.write_text("ok", encoding="utf-8")
    with pytest.raises(ValueError):
        _pipeline().ingest_document(str(bad), document_id="x")
