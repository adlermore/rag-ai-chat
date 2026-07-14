"""Модель чанка с метаданными источника (payload Qdrant, docs/02-ARCHITECTURE.md)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Chunk:
    """Фрагмент документа. Поля page/sheet/row — для точной цитаты в ответе."""

    id: str                       # uuid4 (используется как point-id в Qdrant)
    document_id: str
    document_version: int
    doc_type: str                 # pdf | docx | xlsx
    text: str
    page: int | None = None
    sheet: str | None = None      # Excel: имя листа
    row: int | None = None        # Excel: номер строки
    heading_path: str | None = None  # путь заголовков (Docling)

    def payload(self, doc_title: str | None = None) -> dict[str, Any]:
        """Payload для Qdrant (без вектора). Совпадает с контрактом коллекции."""
        p: dict[str, Any] = {
            "document_id": self.document_id,
            "version": self.document_version,
            "doc_type": self.doc_type,
            "page": self.page,
            "sheet": self.sheet,
            "row": self.row,
            "heading_path": self.heading_path,
            "text": self.text,
        }
        if doc_title is not None:
            p["doc_title"] = doc_title
        return p
