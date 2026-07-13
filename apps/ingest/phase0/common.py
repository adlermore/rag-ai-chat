"""Модели данных и I/O (JSONL) для harness'а Фазы 0."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator


@dataclass
class Chunk:
    """Фрагмент документа с метаданными источника (см. docs/02-ARCHITECTURE.md)."""

    id: str
    doc_id: str
    doc_title: str
    doc_type: str            # pdf | docx | xlsx
    text: str
    page: int | None = None
    sheet: str | None = None  # для Excel
    row: int | None = None    # для Excel
    heading_path: str | None = None  # путь заголовков (Docling)

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "Chunk":
        return Chunk(
            id=d["id"],
            doc_id=d["doc_id"],
            doc_title=d["doc_title"],
            doc_type=d["doc_type"],
            text=d["text"],
            page=d.get("page"),
            sheet=d.get("sheet"),
            row=d.get("row"),
            heading_path=d.get("heading_path"),
        )


@dataclass
class Question:
    """Тестовый вопрос с известным целевым чанком (или ловушка без ответа)."""

    id: str
    question: str
    expected_answer: str = ""
    target_chunk_id: str | None = None  # None для must_refuse
    # Все чанки, реально содержащие ответ. При overlap ~15% один и тот же факт
    # попадает в 2+ соседних чанка — извлечение любого из них считается хитом,
    # иначе recall искусственно занижается. Пусто → используется target_chunk_id.
    target_chunk_ids: list[str] = field(default_factory=list)
    must_refuse: bool = False
    approved: bool = True  # админ может reject'ить (docs/05-EVALUATION.md)

    def acceptable_ids(self) -> set[str]:
        """Множество допустимых целевых чанков (любой из них — верный ответ)."""
        if self.target_chunk_ids:
            return set(self.target_chunk_ids)
        return {self.target_chunk_id} if self.target_chunk_id else set()

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "Question":
        return Question(
            id=d["id"],
            question=d["question"],
            expected_answer=d.get("expected_answer", ""),
            target_chunk_id=d.get("target_chunk_id"),
            target_chunk_ids=list(d.get("target_chunk_ids", [])),
            must_refuse=bool(d.get("must_refuse", False)),
            approved=bool(d.get("approved", True)),
        )


# ── JSONL I/O ──

def write_jsonl(path: Path, items: Iterable[Any]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            payload = item if isinstance(item, dict) else asdict(item)
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
            count += 1
    return count


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def load_chunks(path: Path) -> list[Chunk]:
    return [Chunk.from_dict(d) for d in read_jsonl(path)]


def load_questions(path: Path) -> list[Question]:
    return [Question.from_dict(d) for d in read_jsonl(path)]
