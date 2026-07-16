"""Построчный чанкинг больших markdown-таблиц (поиск по одной ячейке)."""
from __future__ import annotations

from app.pipeline.chunking import chunk_text


def _big_table(n_countries: int = 40) -> str:
    """Имитация таблицы суточных: строка-страна (группа) + строки-города."""
    lines = [
        "| N | Պետություններ | Օրապահիկ USD | Գիշերավարձ USD |",
        "|---|---|---|---|",
    ]
    for i in range(1, n_countries + 1):
        lines.append(f"| {i} | COUNTRY-{i}/ ԵՐԿԻՐ-{i} | | |")
        lines.append(f"| | City-{i}-a | {40 + i} | {90 + i} |")
        lines.append(f"| | City-{i}-b | {50 + i} | {100 + i} |")
    return "\n".join(lines)


def _chunks(text: str):
    return chunk_text(text, document_id="d", document_version=1, doc_type="docx")


def test_big_table_is_split_row_per_chunk() -> None:
    chunks = _chunks(_big_table())
    # 40 стран × 2 города = 80 строк данных → 80 чанков (группы — не чанки).
    assert len(chunks) == 80
    # Каждый чанк — одна строка с шапкой-метками.
    assert all("Օրապահիկ USD:" in c.text for c in chunks)


def test_row_chunk_carries_group_context_and_header() -> None:
    chunks = _chunks(_big_table())
    moscow_like = next(c for c in chunks if "City-7-a" in c.text)
    # Контекст группы (страна) префиксом — иначе город теряет страну.
    assert "COUNTRY-7/ ԵՐԿԻՐ-7" in moscow_like.text
    # Значения снабжены метками из шапки.
    assert "Օրապահիկ USD: 47" in moscow_like.text
    assert "Գիշերավարձ USD: 97" in moscow_like.text


def test_small_table_stays_packed() -> None:
    small = "\n".join(
        [
            "Նախաբան պարբերություն։",
            "",
            "| Ա | Բ |",
            "|---|---|",
            "| 1 | 2 |",
            "| 3 | 4 |",
            "",
            "Վերջաբան պարբերություն։",
        ]
    )
    chunks = _chunks(small)
    # Маленькая таблица не дробится: всё пакуется в один чанк.
    assert len(chunks) == 1
    assert "Նախաբան" in chunks[0].text and "Վերջաբան" in chunks[0].text


def test_prose_around_big_table_preserved() -> None:
    text = "Սկզբի տեքստ։\n\n" + _big_table() + "\n\nՎերջի տեքստ։"
    chunks = _chunks(text)
    assert any("Սկզբի տեքստ" in c.text for c in chunks)
    assert any("Վերջի տեքստ" in c.text for c in chunks)
    assert sum(1 for c in chunks if "Օրապահիկ USD:" in c.text) == 80
