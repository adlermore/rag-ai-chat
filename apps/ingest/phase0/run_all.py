#!/usr/bin/env python3
"""
Оркестратор Фазы 0: ingest → generate → eval одной командой.

Smoke-тест (без документов/ключей):
    python run_all.py --use-fixtures

Реальный прогон:
    python run_all.py --embedders openai,bge-m3 --rerank
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(script: str, extra: list[str]) -> None:
    cmd = [sys.executable, str(HERE / script), *extra]
    print(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Полный прогон Фазы 0")
    parser.add_argument("--use-fixtures", action="store_true")
    parser.add_argument("--embedders", default="dummy")
    parser.add_argument("--rerank", action="store_true")
    args = parser.parse_args()

    fixture_flag = ["--use-fixtures"] if args.use_fixtures else []
    run("01_ingest.py", fixture_flag)
    run("02_generate_questions.py", fixture_flag)

    eval_args = ["--embedders", args.embedders]
    if args.rerank:
        eval_args.append("--rerank")
    run("03_run_eval.py", eval_args)


if __name__ == "__main__":
    main()
