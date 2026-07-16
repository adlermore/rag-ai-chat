#!/usr/bin/env python3
"""
Фаза 4, шаг 1: генерация синтетического eval-датасета (docs/05-EVALUATION.md).

Берёт чанки из ЖИВОГО Qdrant (та же база, по которой отвечает продукт),
стратифицированно сэмплирует прозу и строки таблиц, для каждого чанка LLM
(Anthropic) генерирует армянский вопрос + эталонный ответ; отдельно — вопросы-
ловушки (ответа в документах нет → правильное поведение: отказ).

Выход: eval/data/eval_dataset.jsonl
  {question, expected_answer, chunk_id, document_id, must_refuse, kind}

Запуск (из apps/ingest):
  PYTHONPATH=. python eval/gen_dataset.py --prose 60 --table 60 --traps 30
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Ключи — из корневого .env монорепо.
ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")

import os  # noqa: E402

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = os.environ.get("LLM_MODEL", "claude-sonnet-5")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.environ.get("QDRANT_COLLECTION", "chunks")

DATA_DIR = Path(__file__).resolve().parent / "data"

_QGEN_SYSTEM = (
    "Դու ստեղծում ես ստուգողական հարցեր հայերեն փաստաթղթերի համար։ "
    "Հարցը պետք է լինի փաստացի, բնական (ինչպես աշխատակիցը կհարցներ) և "
    "պատասխանելի ՄԻԱՅՆ տրված հատվածով։ Վերադարձրու ՄԻԱՅՆ JSON՝ "
    '{"question": "...", "answer": "..."} ֆորմատով, հայերեն։'
)

_TRAP_SYSTEM = (
    "Ստեղծիր հայերեն հարցեր, որոնք ընկերության աշխատակիցը կարող էր տալ "
    "(գործուղումներ, աշխատանքային օրենսդրություն, բանկային կարգավորում), "
    "բայց որոնց պատասխանը ՄԻՏՈՒՄՆԱՎՈՐ ԲԱՑԱԿԱՅՈՒՄ Է տրված փաստաթղթերում։ "
    'Վերադարձրու ՄԻԱՅՆ JSON՝ {"questions": ["...", "..."]} ֆորմատով։'
)


def anthropic_json(system: str, user: str, max_tokens: int = 400) -> dict:
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        timeout=60,
    )
    resp.raise_for_status()
    text = "".join(b.get("text", "") for b in resp.json()["content"])
    # LLM может обернуть JSON в ```-блок.
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)


def load_chunks() -> list[dict]:
    """Все чанки из Qdrant (scroll) с payload."""
    out: list[dict] = []
    offset = None
    with httpx.Client(timeout=30) as c:
        while True:
            body: dict = {"limit": 512, "with_payload": True, "with_vector": False}
            if offset is not None:
                body["offset"] = offset
            r = c.post(f"{QDRANT_URL}/collections/{COLLECTION}/points/scroll", json=body)
            r.raise_for_status()
            res = r.json()["result"]
            for p in res["points"]:
                out.append({"chunk_id": str(p["id"]), **(p.get("payload") or {})})
            offset = res.get("next_page_offset")
            if offset is None:
                break
    return out


def is_table_row(text: str) -> bool:
    # Строки таблиц собраны как «метка: значение | …».
    return " | " in text and "\n" not in text.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prose", type=int, default=60)
    ap.add_argument("--table", type=int, default=60)
    ap.add_argument("--traps", type=int, default=30)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not ANTHROPIC_KEY:
        sys.exit("ANTHROPIC_API_KEY не задан (корневой .env).")

    rng = random.Random(args.seed)
    chunks = load_chunks()
    prose = [c for c in chunks if not is_table_row(c.get("text", "")) and len(c.get("text", "")) >= 120]
    table = [c for c in chunks if is_table_row(c.get("text", "")) and len(c.get("text", "")) >= 60]
    print(f"чанков: всего {len(chunks)}, проза {len(prose)}, строки таблиц {len(table)}")

    sample = rng.sample(prose, min(args.prose, len(prose))) + rng.sample(
        table, min(args.table, len(table))
    )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "eval_dataset.jsonl"
    n_ok = 0
    with out_path.open("w", encoding="utf-8") as f:
        for i, ch in enumerate(sample, 1):
            kind = "table" if is_table_row(ch["text"]) else "prose"
            try:
                data = anthropic_json(_QGEN_SYSTEM, ch["text"])
                q = str(data.get("question", "")).strip()
                a = str(data.get("answer", "")).strip()
                if not q:
                    raise ValueError("пустой вопрос")
                f.write(
                    json.dumps(
                        {
                            "question": q,
                            "expected_answer": a,
                            "chunk_id": ch["chunk_id"],
                            "document_id": ch.get("document_id"),
                            "must_refuse": False,
                            "kind": kind,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                n_ok += 1
            except Exception as e:  # noqa: BLE001
                print(f"  ⚠️ пропуск {ch['chunk_id'][:8]}: {e}")
            if i % 20 == 0:
                print(f"  {i}/{len(sample)} (ok={n_ok})", flush=True)
            time.sleep(0.3)  # мягкий rate-limit

        # Ловушки — одним вызовом.
        titles = sorted({c.get("doc_title") or "" for c in chunks if c.get("doc_title")})
        try:
            data = anthropic_json(
                _TRAP_SYSTEM,
                "Փաստաթղթեր՝ " + "; ".join(titles) + f"։ Ստեղծիր {args.traps} հարց-թակարդ։",
                max_tokens=2000,
            )
            for q in list(data.get("questions", []))[: args.traps]:
                f.write(
                    json.dumps(
                        {
                            "question": str(q).strip(),
                            "expected_answer": "",
                            "chunk_id": None,
                            "document_id": None,
                            "must_refuse": True,
                            "kind": "trap",
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                n_ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️ ловушки не сгенерировались: {e}")

    print(f"✓ датасет: {n_ok} записей → {out_path}")


if __name__ == "__main__":
    main()
