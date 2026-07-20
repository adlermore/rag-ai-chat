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


# ── Markdown-таблицы: построчный чанкинг ──
# Большая таблица (суточные по ~200 странам) в «пачечном» чанкинге давала чанки
# с десятками строк — запрос по одной ячейке («օրապահիկ Մոսկվա») не поднимал
# нужную строку в top-5 (выявлено верификацией Фазы 2). Решение как для Excel:
# одна строка = один чанк, с шапкой и контекстом группы (docs/01-SPEC.md).

_TABLE_LINE_RE = re.compile(r"^\s*\|.*\|\s*$")


def _split_table_blocks(text: str) -> list[tuple[str, str]]:
    """Разбивает текст на блоки ("prose"|"table", содержимое) в порядке документа."""
    blocks: list[tuple[str, str]] = []
    buf: list[str] = []
    mode = "prose"
    for line in text.splitlines():
        line_mode = "table" if _TABLE_LINE_RE.match(line) else "prose"
        if line_mode != mode and buf:
            blocks.append((mode, "\n".join(buf)))
            buf = []
        mode = line_mode
        buf.append(line)
    if buf:
        blocks.append((mode, "\n".join(buf)))
    return blocks


def _parse_table_rows(table_text: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in table_text.splitlines():
        line = line.strip().strip("|")
        cells = [c.strip() for c in line.split("|")]
        if any(cells):
            rows.append(cells)
    return rows


def _has_digit(cells: list[str]) -> bool:
    return any(ch.isdigit() for c in cells for ch in c)


def _merge_header_rows(rows: list[list[str]]) -> tuple[list[str], list[list[str]]]:
    """Склеивает многоярусную шапку в одну строку меток.

    Docling отдаёт двухъярусную шапку (объединённые ячейки + подзаголовки вроде
    «նվազագույնը/առավելագույնը») отдельными строками, дублируя объединённую
    ячейку в каждую колонку. Строку сразу после шапки без единой цифры считаем
    её продолжением — но только если ниже есть строки с цифрами (таблицы из
    чистого текста не трогаем).
    """
    header = list(rows[0])
    data = rows[1:]
    merged = 0
    while (
        data
        and merged < 2
        and not _has_digit(data[0])
        and any(_has_digit(r) for r in data[1:])
    ):
        for j, c in enumerate(data[0]):
            if c and j < len(header) and c != header[j]:
                header[j] = f"{header[j]} {c}".strip()
        data = data[1:]
        merged += 1
    return header, data


def _table_row_texts(rows: list[list[str]]) -> list[str]:
    """Строки таблицы → самодостаточные тексты «шапка: значение | …».

    Строка со значениями только в первых двух колонках трактуется как заголовок
    группы (напр., страна перед списком городов) и добавляется префиксом к
    последующим строкам данных — иначе строка города теряет страну.
    """
    if not rows:
        return []
    header, data = _merge_header_rows(rows)
    if not data:
        # Таблица без строк данных (артефакт вёрстки) — отдаём шапку без дублей
        # объединённых ячеек, чтобы не потерять содержимое.
        seen: list[str] = []
        for c in header:
            if c and (not seen or c != seen[-1]):
                seen.append(c)
        return [" | ".join(seen)] if seen else []
    group_ctx: str | None = None
    out: list[str] = []
    for cells in data:
        nonempty = [i for i, c in enumerate(cells) if c]
        if not nonempty:
            continue
        if all(i < 2 for i in nonempty) and len(cells) > 2:
            group_ctx = " ".join(cells[i] for i in nonempty)
            continue
        pairs = []
        for i in nonempty:
            label = header[i] if i < len(header) and header[i] else ""
            pairs.append(f"{label}: {cells[i]}" if label else cells[i])
        text = " | ".join(pairs)
        if group_ctx:
            text = f"{group_ctx} | {text}"
        out.append(text)
    return out


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

    # Блоки в порядке документа: проза пакуется до target; большая таблица
    # (не влезающая в один чанк) режется построчно — чанк на строку.
    units: list[str] = []          # прозаические сегменты (пакуются)
    row_chunks_after: dict[int, list[str]] = {}  # позиция → готовые строки-чанки
    for kind, block in _split_table_blocks(_clean_markdown(text)):
        if kind == "table":
            # Любая таблица рендерится строками «шапка: значение | …»: сырой
            # склейкой ячеек шапка (с дублями объединённых ячеек от Docling)
            # превращалась в нечитаемый «суп» в начале чанка и в сниппете
            # источника. Маленькая таблица остаётся одним сегментом.
            row_texts = _table_row_texts(_parse_table_rows(block))
            if not row_texts:
                continue
            joined = "\n".join(row_texts)
            if count_tokens(joined) <= target:
                units.append(joined)
            else:
                row_chunks_after.setdefault(len(units), []).extend(row_texts)
        else:
            for para in _split_paragraphs(block):
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

    def emit_row(row_text: str) -> None:
        chunks.append(
            Chunk(
                id=str(uuid.uuid4()),
                document_id=document_id,
                document_version=document_version,
                doc_type=doc_type,
                text=row_text,
                page=page,
                heading_path=heading_path,
            )
        )

    def emit_table_rows(pos: int) -> None:
        if pos not in row_chunks_after:
            return
        nonlocal buf, buf_tokens
        flush()
        buf, buf_tokens = [], 0  # без overlap через границу таблицы
        for row_text in row_chunks_after[pos]:
            emit_row(row_text)

    for i, unit in enumerate(units):
        emit_table_rows(i)
        utok = count_tokens(unit)
        if buf and buf_tokens + utok > target:
            flush()
        buf.append(unit)
        buf_tokens += utok

    flush()
    emit_table_rows(len(units))
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
