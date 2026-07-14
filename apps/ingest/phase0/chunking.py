"""
Структурный чанкинг: 300–600 токенов, overlap ~15% (docs/02-ARCHITECTURE.md).

Размер чанка меряем токенайзером, близким к моделям эмбеддинга. tiktoken/cl100k
(токенайзер GPT) НЕПРИГОДЕН для армянского: он почти не знает эту письменность и
раздувает счёт в ~9–16× (замер Фазы 0), из-за чего чанки выходили по 1–2
предложения (медиана 34 слова) вместо 300–600 токенов. Используем мультиязычный
XLM-Roberta — токенайзер bge-m3 (~1.8 токена/слово на армянском); при его
отсутствии (smoke-тест без transformers) — оценка по словам.
Продовый чанкинг (по структуре Docling, Excel «строка+шапка+лист») — Фаза 2.
"""
from __future__ import annotations

import re
import uuid

from common import Chunk
from config import CONFIG

_ARMENIAN_TOKEN_FACTOR = 1.85  # армянский: ~1.85 subword-токена на слово (замер bge-m3)

# Ленивый токенайзер bge-m3: грузим один раз при первом вызове, чтобы не тянуть
# transformers при импорте модуля (важно для smoke-теста и unit-тестов чанкинга).
_TOKENIZER = None
_TOKENIZER_TRIED = False


def count_tokens(text: str) -> int:
    global _TOKENIZER, _TOKENIZER_TRIED
    if not _TOKENIZER_TRIED:
        _TOKENIZER_TRIED = True
        try:
            from transformers import AutoTokenizer  # type: ignore

            _TOKENIZER = AutoTokenizer.from_pretrained(CONFIG.bge_m3_model)
        except Exception:
            _TOKENIZER = None  # fallback на пословную оценку
    if _TOKENIZER is not None:
        return len(_TOKENIZER.encode(text, add_special_tokens=False))
    return int(len(text.split()) * _ARMENIAN_TOKEN_FACTOR)


# Строки-разделители и пустые ячейки markdown-таблиц (Docling плодит их из
# объединённых ячеек) — информации не несут, только раздувают чанки.
_TABLE_NOISE_RE = re.compile(r"^[\s|:\-]+$")
# Сжатие горизонтального «паддинга» (внутри ячеек таблиц — десятки пробелов).
_WS_RE = re.compile(r"[ \t]{2,}")
# Границы предложений: армянская точка ։ (U+0589) и ascii-двоеточие/точка —
# в армянских цифровых текстах предложение часто закрывают именно `:`.
_SENT_SPLIT_RE = re.compile(r"(?<=[։:.;!?])\s+")


def _clean_markdown(text: str) -> str:
    """Убирает шум markdown-таблиц и схлопывает паддинг (см. Docling DOCX-таблицы)."""
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
    """Режет по словам на куски <= target токенов (сегменты без пунктуации: таблицы и т.п.)."""
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
    """Абзац → сегменты не крупнее target: по предложениям, при нужде — жёстко."""
    if count_tokens(paragraph) <= target:
        return [paragraph]
    segs: list[str] = []
    buf: list[str] = []
    for sent in _SENT_SPLIT_RE.split(paragraph):
        sent = sent.strip()
        if not sent:
            continue
        if count_tokens(sent) > target:  # одно «предложение» само больше target
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
    doc_id: str,
    doc_title: str,
    doc_type: str,
    page: int | None = None,
    heading_path: str | None = None,
) -> list[Chunk]:
    """Режет текст на чанки целевого размера (300–600 ток.) с перекрытием ~15%.

    Крупные абзацы и markdown-таблицы дробятся на предложения/куски, чтобы ни один
    чанк не превышал target существенно (иначе dense-эмбеддинг теряет хвост).
    """
    target = CONFIG.chunk_target_tokens
    overlap_tokens = int(target * CONFIG.chunk_overlap_ratio)

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
                doc_id=doc_id,
                doc_title=doc_title,
                doc_type=doc_type,
                text="\n\n".join(buf),
                page=page,
                heading_path=heading_path,
            )
        )
        # overlap: хвостовой сегмент переносим в начало следующего чанка, но
        # только если чанк состоял из >1 сегмента — иначе получим дубль-чанк.
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
