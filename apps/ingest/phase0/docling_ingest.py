"""
Ингестия документов через Docling → список Chunk.

⚠️ Docling — тяжёлая зависимость; импортируется лениво. Это версия для Фазы 0
(собрать 50–80 чанков из 3–5 документов для замера recall). Продовый парсинг
(таблицы, точные номера страниц, Excel «строка+шапка+лист» с openpyxl) —
доводится в Фазе 2.
"""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

from chunking import chunk_text
from common import Chunk
from config import DATA_DIR

_SUPPORTED = {".pdf": "pdf", ".docx": "docx", ".xlsx": "xlsx"}

# Кэш markdown-экспорта Docling: парсинг PDF на CPU — самый долгий шаг, а при
# подборе размера чанка (Фаза 0) документ приходится перечанковывать много раз.
# Кэшируем по (имя, размер, mtime), чтобы перечанковка шла без повторного парсинга.
_MD_CACHE_DIR = DATA_DIR / "_md_cache"


def _markdown_for(path: Path) -> str:
    stat = path.stat()
    key = f"{path.name}:{stat.st_size}:{int(stat.st_mtime)}"
    cache_file = _MD_CACHE_DIR / (hashlib.md5(key.encode()).hexdigest() + ".md")
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    converter = _load_converter()
    result = converter.convert(str(path))
    markdown = result.document.export_to_markdown()

    _MD_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(markdown, encoding="utf-8")
    return markdown


def _load_converter():
    try:
        from docling.datamodel.base_models import InputFormat  # ленивый импорт
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "Docling не установлен. Выполните: "
            "pip install -r requirements-phase0.txt"
        ) from e
    # Все PDF заказчика — цифровые (docs/01-SPEC.md), OCR не нужен: он медленный
    # на CPU и вносит ошибки поверх точной нативной экстракции текста.
    pdf_opts = PdfPipelineOptions()
    pdf_opts.do_ocr = False
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_opts)}
    )


def ingest_file(path: Path) -> list[Chunk]:
    """Парсит один файл и возвращает его чанки."""
    doc_type = _SUPPORTED.get(path.suffix.lower())
    if not doc_type:
        raise ValueError(f"Неподдерживаемый формат: {path.suffix}")

    doc_id = str(uuid.uuid4())
    doc_title = path.stem

    # Docling даёт структурированный markdown; для Фазы 0 этого достаточно,
    # чтобы нарезать осмысленные чанки. Точный per-page split — TODO Фазы 2.
    markdown = _markdown_for(path)
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
