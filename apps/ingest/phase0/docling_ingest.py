"""
Ингестия документов через Docling → список Chunk.

⚠️ Docling — тяжёлая зависимость; импортируется лениво. Это версия для Фазы 0
(собрать 50–80 чанков из 3–5 документов для замера recall). Продовый парсинг
(таблицы, точные номера страниц, Excel «строка+шапка+лист» с openpyxl) —
доводится в Фазе 2.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from chunking import chunk_text
from common import Chunk

_SUPPORTED = {".pdf": "pdf", ".docx": "docx", ".xlsx": "xlsx"}


def _load_converter():
    try:
        from docling.document_converter import DocumentConverter  # ленивый импорт
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "Docling не установлен. Выполните: "
            "pip install -r requirements-phase0.txt"
        ) from e
    return DocumentConverter()


def ingest_file(path: Path) -> list[Chunk]:
    """Парсит один файл и возвращает его чанки."""
    doc_type = _SUPPORTED.get(path.suffix.lower())
    if not doc_type:
        raise ValueError(f"Неподдерживаемый формат: {path.suffix}")

    converter = _load_converter()
    result = converter.convert(str(path))
    doc = result.document

    doc_id = str(uuid.uuid4())
    doc_title = path.stem

    # Docling даёт структурированный markdown; для Фазы 0 этого достаточно,
    # чтобы нарезать осмысленные чанки. Точный per-page split — TODO Фазы 2.
    markdown = doc.export_to_markdown()
    return chunk_text(
        markdown,
        doc_id=doc_id,
        doc_title=doc_title,
        doc_type=doc_type,
        page=None,
    )


def ingest_dir(raw_dir: Path) -> list[Chunk]:
    """Парсит все поддерживаемые документы из папки."""
    files = [
        p
        for p in sorted(raw_dir.iterdir())
        if p.is_file() and p.suffix.lower() in _SUPPORTED
    ]
    if not files:
        raise FileNotFoundError(
            f"В {raw_dir} нет документов (.pdf/.docx/.xlsx). "
            "Положите 3–5 реальных армянских документов заказчика."
        )
    all_chunks: list[Chunk] = []
    for f in files:
        print(f"  · парсинг {f.name} …")
        all_chunks.extend(ingest_file(f))
    return all_chunks
