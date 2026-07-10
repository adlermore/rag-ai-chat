#!/usr/bin/env python3
"""
Шаг 2 Фазы 0: chunks.jsonl → questions.jsonl (LLM-генерация на армянском).

Использование:
    python 02_generate_questions.py                 # реальная генерация (нужен OPENAI_API_KEY)
    python 02_generate_questions.py --use-fixtures  # готовые фикстуры (smoke-тест)
"""
from __future__ import annotations

import argparse
import shutil

from common import load_chunks, load_questions, write_jsonl
from config import CHUNKS_PATH, FIXTURES_DIR, QUESTIONS_PATH


def main() -> None:
    parser = argparse.ArgumentParser(description="Генерация вопросов Фазы 0")
    parser.add_argument("--use-fixtures", action="store_true")
    args = parser.parse_args()

    if args.use_fixtures:
        shutil.copyfile(FIXTURES_DIR / "sample_questions.jsonl", QUESTIONS_PATH)
        qs = load_questions(QUESTIONS_PATH)
        print(f"✓ Фикстуры вопросов: {len(qs)} шт. → {QUESTIONS_PATH}")
        return

    if not CHUNKS_PATH.exists():
        raise SystemExit("Сначала выполните 01_ingest.py (нет chunks.jsonl).")

    from qgen import generate_questions

    chunks = load_chunks(CHUNKS_PATH)
    print(f"Генерация вопросов по {len(chunks)} чанкам …")
    questions = generate_questions(chunks)
    n = write_jsonl(QUESTIONS_PATH, questions)
    answerable = sum(1 for q in questions if not q.must_refuse)
    print(
        f"✓ {n} вопросов ({answerable} фактических, {n - answerable} ловушек) "
        f"→ {QUESTIONS_PATH}"
    )
    print("  Следующий шаг — ручной review (approve/reject) в админке (Фаза 4).")


if __name__ == "__main__":
    main()
