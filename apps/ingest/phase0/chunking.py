"""
Структурный чанкинг: 300–600 токенов, overlap ~15% (docs/02-ARCHITECTURE.md).

Оценка числа токенов — приблизительная (по словам с поправкой на армянский,
который даёт ~+25% токенов). Если установлен tiktoken — используется он.
Это версия для Фазы 0; продовый чанкинг (по структуре Docling, Excel «строка+
шапка+лист») реализуется в Фазе 2.
"""
from __future__ import annotations

import re
import uuid

from common import Chunk
from config import CONFIG

_ARMENIAN_TOKEN_FACTOR = 1.25  # армянский текст ~ +25% токенов к числу слов

try:
    import tiktoken  # type: ignore

    _ENC = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text: str) -> int:
        return len(_ENC.encode(text))

except Exception:  # tiktoken не установлен → приблизительно по словам

    def count_tokens(text: str) -> int:
        words = len(text.split())
        return int(words * _ARMENIAN_TOKEN_FACTOR)


def _split_paragraphs(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n", text.strip())
    return [p.strip() for p in parts if p.strip()]


def chunk_text(
    text: str,
    *,
    doc_id: str,
    doc_title: str,
    doc_type: str,
    page: int | None = None,
    heading_path: str | None = None,
) -> list[Chunk]:
    """Режет текст на чанки целевого размера с перекрытием по абзацам."""
    target = CONFIG.chunk_target_tokens
    overlap_tokens = int(target * CONFIG.chunk_overlap_ratio)

    paragraphs = _split_paragraphs(text)
    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_tokens = 0

    def flush() -> None:
        nonlocal buf, buf_tokens
        if not buf:
            return
        chunk_text_str = "\n\n".join(buf)
        chunks.append(
            Chunk(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                doc_title=doc_title,
                doc_type=doc_type,
                text=chunk_text_str,
                page=page,
                heading_path=heading_path,
            )
        )
        # overlap: оставляем хвост последнего абзаца
        if overlap_tokens > 0 and buf:
            tail = buf[-1]
            buf = [tail]
            buf_tokens = count_tokens(tail)
        else:
            buf = []
            buf_tokens = 0

    for para in paragraphs:
        ptok = count_tokens(para)
        if buf_tokens + ptok > target and buf:
            flush()
        buf.append(para)
        buf_tokens += ptok

    flush()
    # убрать возможный дубль-хвост, если последний flush создал чанк только из overlap
    return chunks


def excel_row_chunk(
    *,
    doc_id: str,
    doc_title: str,
    sheet: str,
    row: int,
    headers: list[str],
    values: list[str],
) -> Chunk:
    """
    Excel: одна строка = один чанк, с включением шапки и имени листа в текст
    (иначе строка без контекста бесполезна для поиска — docs/01-SPEC.md).
    Пример текста: «Թերթ: Սակագներ | Նահանգ: Տեխաս | Վճար: $120».
    """
    pairs = [f"{h}: {v}" for h, v in zip(headers, values)]
    text = f"Թերթ: {sheet} | " + " | ".join(pairs)
    return Chunk(
        id=str(uuid.uuid4()),
        doc_id=doc_id,
        doc_title=doc_title,
        doc_type="xlsx",
        text=text,
        sheet=sheet,
        row=row,
    )
