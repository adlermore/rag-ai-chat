#!/usr/bin/env python3
"""
Шаг 1 Фазы 0: документы из data/raw/ → data/chunks.jsonl (через Docling).

Использование:
    python 01_ingest.py                 # парсит data/raw/*
    python 01_ingest.py --use-fixtures  # копирует фикстуры (для smoke-теста)
"""
from __future__ import annotations

import argparse
import shutil

from common import load_chunks, write_jsonl
from config import CONFIG, CHUNKS_PATH, FIXTURES_DIR, RAW_DIR


def main() -> None:
    parser = argparse.ArgumentParser(description="Ингестия документов Фазы 0")
    parser.add_argument(
        "--use-fixtures",
        action="store_true",
        help="Использовать синтетические фикстуры вместо data/raw/",
    )
    args = parser.parse_args()

    if args.use_fixtures:
        src = FIXTURES_DIR / "sample_chunks.jsonl"
        shutil.copyfile(src, CHUNKS_PATH)
        n = len(load_chunks(CHUNKS_PATH))
        print(f"✓ Фикстуры скопированы: {n} чанков → {CHUNKS_PATH}")
        return

    # Ленивый импорт: Docling нужен только для реального прогона.
    from docling_ingest import ingest_dir

    print(f"Парсинг документов из {RAW_DIR} …")
    chunks = ingest_dir(RAW_DIR)
    n = write_jsonl(CHUNKS_PATH, chunks)
    print(f"✓ Собрано {n} чанков → {CHUNKS_PATH}")
    if not (50 <= n <= 80):
        print(
            f"  ⚠️  Цель Фазы 0 — 50–80 чанков (сейчас {n}). "
            f"Скорректируйте число документов или PHASE0_CHUNK_TOKENS "
            f"(={CONFIG.chunk_target_tokens})."
        )


if __name__ == "__main__":
    main()
