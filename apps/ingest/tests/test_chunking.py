"""Unit-тесты чанкинга (логика Фазы 0, продовые метаданные)."""
from __future__ import annotations

from app.config import get_config
from app.pipeline.chunking import chunk_text, count_tokens, excel_row_chunk


def _armenian_paragraph(n_sentences: int) -> str:
    s = "Աշխատողն ունի հանգստի իրավունք և վարձատրվող ամենամյա արձակուրդ։"
    return " ".join([s] * n_sentences)


def test_chunk_metadata_propagates() -> None:
    text = "\n\n".join(_armenian_paragraph(3) for _ in range(6))
    chunks = chunk_text(
        text, document_id="doc-1", document_version=2, doc_type="pdf",
        heading_path="Գլուխ 1",
    )
    assert chunks, "должен получиться хотя бы один чанк"
    for c in chunks:
        assert c.document_id == "doc-1"
        assert c.document_version == 2
        assert c.doc_type == "pdf"
        assert c.heading_path == "Գլուխ 1"
        assert c.text.strip()


def test_chunks_respect_target_size() -> None:
    cfg = get_config()
    # Длинный текст → несколько чанков, каждый не сильно больше target.
    text = "\n\n".join(_armenian_paragraph(4) for _ in range(40))
    chunks = chunk_text(
        text, document_id="d", document_version=1, doc_type="pdf",
    )
    assert len(chunks) >= 2
    # Допускаем небольшой перебор из-за неделимых сегментов + overlap.
    for c in chunks:
        assert count_tokens(c.text) <= cfg.chunk_target_tokens * 1.6


def test_overlap_between_consecutive_chunks() -> None:
    text = "\n\n".join(f"Պարբերություն համար {i}. " + _armenian_paragraph(3) for i in range(30))
    chunks = chunk_text(text, document_id="d", document_version=1, doc_type="pdf")
    assert len(chunks) >= 2
    # overlap: последний сегмент чанка встречается в начале следующего.
    tail = chunks[0].text.split("\n\n")[-1]
    assert tail in chunks[1].text


def test_excel_row_chunk_includes_header_and_sheet() -> None:
    c = excel_row_chunk(
        document_id="x", document_version=1, sheet="Սակագներ", row=5,
        headers=["Նահանգ", "Վճար"], values=["Տեխաս", "$120"],
    )
    assert c.sheet == "Սակագներ"
    assert c.row == 5
    assert c.doc_type == "xlsx"
    assert "Սակագներ" in c.text
    assert "Նահանգ: Տեխաս" in c.text
    assert "Վճար: $120" in c.text
