"""
Структурный чанкинг: 300–600 токенов, overlap ~15% (docs/02-ARCHITECTURE.md).

Размер меряем токенайзером модели эмбеддинга (XLM-Roberta / bge-m3, ~1.8 ток/слово
на армянском). tiktoken/cl100k НЕПРИГОДЕН: раздувает армянский в ~9–16× (замер
Фазы 0), из-за чего чанки выходили по 1–2 предложения. Fallback — оценка по словам.
"""
from __future__ import annotations

import re
import uuid

from ..config import get_config
from .models import Chunk

_ARMENIAN_TOKEN_FACTOR = 1.85

_TOKENIZER = None
_TOKENIZER_TRIED = False


def count_tokens(text: str) -> int:
    global _TOKENIZER, _TOKENIZER_TRIED
    if not _TOKENIZER_TRIED:
        _TOKENIZER_TRIED = True
        try:
            from transformers import AutoTokenizer  # type: ignore

            _TOKENIZER = AutoTokenizer.from_pretrained("BAAI/bge-m3")
            # Мы используем токенайзер только для ПОДСЧЁТА токенов при нарезке
            # (не для энкода модели). На длинных абзацах он иначе печатает
            # предупреждение «sequence length > 8192» — подавляем, задав большой
            # model_max_length. Усечения не происходит (encode без truncation).
            _TOKENIZER.model_max_length = int(1e9)
        except Exception:
            _TOKENIZER = None
    if _TOKENIZER is not None:
        return len(_TOKENIZER.encode(text, add_special_tokens=False))
    return int(len(text.split()) * _ARMENIAN_TOKEN_FACTOR)


# Шум markdown-таблиц (Docling плодит из объединённых ячеек) и паддинг.
_TABLE_NOISE_RE = re.compile(r"^[\s|:\-]+$")
_WS_RE = re.compile(r"[ \t]{2,}")
# Границы предложений: армянская `։` (U+0589) и ascii-двоеточие/точка.
_SENT_SPLIT_RE = re.compile(r"(?<=[։:.;!?])\s+")


def _clean_markdown(text: str) -> str:
    out: list[str] = []
    for ln in text.splitlines():
        if _TABLE_NOISE_RE.match(ln):
            continue
        out.append(_WS_RE.sub(" ", ln).strip())
    return "\n".join(out)


def _split_paragraphs(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _hard_slice(text: str, target: int) -> list[str]:
    out: list[str] = []
    buf: list[str] = []
    for w in text.split():
        buf.append(w)
        if count_tokens(" ".join(buf)) >= target:
            out.append(" ".join(buf))
            buf = []
    if buf:
        out.append(" ".join(buf))
    return out


def _segments(paragraph: str, target: int) -> list[str]:
    if count_tokens(paragraph) <= target:
        return [paragraph]
    segs: list[str] = []
    buf: list[str] = []
    for sent in _SENT_SPLIT_RE.split(paragraph):
        sent = sent.strip()
        if not sent:
            continue
        if count_tokens(sent) > target:
            if buf:
                segs.append(" ".join(buf))
                buf = []
            segs.extend(_hard_slice(sent, target))
            continue
        if buf and count_tokens(" ".join(buf + [sent])) > target:
            segs.append(" ".join(buf))
            buf = [sent]
        else:
            buf.append(sent)
    if buf:
        segs.append(" ".join(buf))
    return segs


def chunk_text(
    text: str,
    *,
    document_id: str,
    document_version: int,
    doc_type: str,
    page: int | None = None,
    heading_path: str | None = None,
) -> list[Chunk]:
    """Режет текст на чанки целевого размера с перекрытием ~15%."""
    cfg = get_config()
    target = cfg.chunk_target_tokens
    overlap_tokens = int(target * cfg.chunk_overlap_ratio)

    units: list[str] = []
    for para in _split_paragraphs(_clean_markdown(text)):
        units.extend(_segments(para, target))

    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_tokens = 0

    def flush() -> None:
        nonlocal buf, buf_tokens
        if not buf:
            return
        chunks.append(
            Chunk(
                id=str(uuid.uuid4()),
                document_id=document_id,
                document_version=document_version,
                doc_type=doc_type,
                text="\n\n".join(buf),
                page=page,
                heading_path=heading_path,
            )
        )
        # overlap: хвостовой сегмент переносим в начало следующего чанка, но
        # только если чанк состоял из >1 сегмента (иначе дубль-чанк).
        if overlap_tokens > 0 and len(buf) > 1:
            tail = buf[-1]
            buf = [tail]
            buf_tokens = count_tokens(tail)
        else:
            buf = []
            buf_tokens = 0

    for unit in units:
        utok = count_tokens(unit)
        if buf and buf_tokens + utok > target:
            flush()
        buf.append(unit)
        buf_tokens += utok

    flush()
    return chunks


def excel_row_chunk(
    *,
    document_id: str,
    document_version: int,
    sheet: str,
    row: int,
    headers: list[str],
    values: list[str],
) -> Chunk:
    """
    Excel: одна строка = один чанк, с шапкой и именем листа в тексте (иначе строка
    без контекста бесполезна для поиска — docs/01-SPEC.md).
    Пример: «Թերթ: Սակագներ | Նահանգ: Տեխաս | Վճար: $120».
    """
    pairs = [f"{h}: {v}" for h, v in zip(headers, values)]
    text = f"Թերթ: {sheet} | " + " | ".join(pairs)
    return Chunk(
        id=str(uuid.uuid4()),
        document_id=document_id,
        document_version=document_version,
        doc_type="xlsx",
        text=text,
        sheet=sheet,
        row=row,
    )
