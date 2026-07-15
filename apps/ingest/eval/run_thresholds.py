#!/usr/bin/env python3
"""
Фаза 4, шаг 2: прогон датасета и калибровка порогов T_low/T_high
(docs/05-EVALUATION.md §Калибровка).

Для каждого вопроса гоняет ЖИВОЙ retrieval (bge-m3 + BM25 → RRF → reranker,
та же цепочка, что в проде) и пишет rank целевого чанка + top-score reranker'а.
Затем:
  · распределения top-score для answerable / traps;
  · сетка LOW: false answer rate (ловушка прошла порог) и
    false refusal rate (отвечаемый вопрос ниже порога);
  · рекомендация: LOW — max порог с false refusal ≤ 5% при min false answer;
    HIGH — квантиль скоров верно-найденных ответов (75% из них — «уверенные»).

Выход: eval/reports/threshold_report.md (+ eval/data/eval_runs.jsonl с raw).

Запуск (из apps/ingest):
  QDRANT_URL=http://localhost:6333 PYTHONPATH=. python eval/run_thresholds.py
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

from app.pipeline.orchestrator import IngestPipeline

DATA = Path(__file__).resolve().parent / "data" / "eval_dataset.jsonl"
RUNS = Path(__file__).resolve().parent / "data" / "eval_runs.jsonl"
REPORT = Path(__file__).resolve().parent / "reports" / "threshold_report.md"


def pct(x: float) -> str:
    return f"{100 * x:.1f}%"


def _alive_chunk_ids(ids: list[str]) -> set[str]:
    """chunk_id, реально существующие в Qdrant (реиндекс документа меняет id —
    вопросы с умершими целями исключаются из recall, иначе метрика ложно падает)."""
    import os
    import urllib.request

    url = os.environ.get("QDRANT_URL", "http://localhost:6333")
    coll = os.environ.get("QDRANT_COLLECTION", "chunks")
    alive: set[str] = set()
    for i in range(0, len(ids), 256):
        body = json.dumps({"ids": ids[i : i + 256]}).encode()
        req = urllib.request.Request(
            f"{url}/collections/{coll}/points",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        res = json.load(urllib.request.urlopen(req, timeout=30))
        alive.update(str(p["id"]) for p in res.get("result", []))
    return alive


def main() -> None:
    rows = [json.loads(l) for l in DATA.open(encoding="utf-8") if l.strip()]
    answerable = [r for r in rows if not r["must_refuse"]]
    traps = [r for r in rows if r["must_refuse"]]

    alive = _alive_chunk_ids([r["chunk_id"] for r in answerable if r["chunk_id"]])
    stale = [r for r in answerable if r["chunk_id"] and r["chunk_id"] not in alive]
    if stale:
        print(
            f"⚠️  исключено {len(stale)} вопросов: целевой чанк устарел "
            f"(документ реиндексирован после генерации датасета)"
        )
    answerable = [r for r in answerable if r["chunk_id"] in alive]
    rows = answerable + traps
    print(f"датасет: {len(answerable)} отвечаемых ({sum(1 for r in answerable if r['kind']=='table')} табл.), {len(traps)} ловушек")

    pipe = IngestPipeline()
    runs: list[dict] = []
    for i, r in enumerate(rows, 1):
        hits = pipe.search(r["question"], top_out=10)
        ids = [h.chunk_id for h in hits]
        rank = (ids.index(r["chunk_id"]) + 1) if r["chunk_id"] in ids else None
        runs.append(
            {
                **r,
                "top_score": hits[0].score if hits else 0.0,
                "rank": rank,
            }
        )
        if i % 25 == 0:
            print(f"  {i}/{len(rows)}", flush=True)

    RUNS.parent.mkdir(parents=True, exist_ok=True)
    with RUNS.open("w", encoding="utf-8") as f:
        for r in runs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    ans = [r for r in runs if not r["must_refuse"]]
    trp = [r for r in runs if r["must_refuse"]]

    # Retrieval-метрики
    def recall_at(k: int, subset: list[dict]) -> float:
        return sum(1 for r in subset if r["rank"] and r["rank"] <= k) / max(1, len(subset))

    tables = [r for r in ans if r["kind"] == "table"]
    proses = [r for r in ans if r["kind"] == "prose"]

    # Сетка порогов LOW
    grid: list[tuple[float, float, float]] = []
    for low_i in range(2, 61, 2):
        low = low_i / 100
        fr = sum(1 for r in ans if r["top_score"] < low) / max(1, len(ans))
        fa = sum(1 for r in trp if r["top_score"] >= low) / max(1, len(trp))
        grid.append((low, fr, fa))

    # Рекомендация LOW: false refusal ≤ 5%, минимизируем false answer.
    ok_rows = [g for g in grid if g[1] <= 0.05]
    rec_low = max(ok_rows, key=lambda g: g[0])[0] if ok_rows else 0.35

    # HIGH: 25-й перцентиль скоров вопросов, где верный чанк на 1-м месте
    top1_scores = sorted(r["top_score"] for r in ans if r["rank"] == 1)
    rec_high = (
        top1_scores[max(0, len(top1_scores) // 4 - 1)] if top1_scores else 0.62
    )
    rec_high = max(rec_high, rec_low + 0.05)

    lines = [
        "# Калибровка порогов guardrail (Фаза 4)",
        "",
        f"Датасет: {len(ans)} отвечаемых ({len(proses)} проза, {len(tables)} строки таблиц), {len(trp)} ловушек."
        + (
            f" Исключено {len(stale)} вопросов с устаревшими chunk_id (реиндекс)."
            if stale
            else ""
        ),
        "",
        "## Retrieval",
        "",
        "| Метрика | Всего | Проза | Таблицы |",
        "|---|---|---|---|",
        f"| recall@5 | {recall_at(5, ans):.3f} | {recall_at(5, proses):.3f} | {recall_at(5, tables):.3f} |",
        f"| recall@10 | {recall_at(10, ans):.3f} | {recall_at(10, proses):.3f} | {recall_at(10, tables):.3f} |",
        "",
        "## Распределение top-score",
        "",
        "| Группа | min | p25 | медиана | p75 | max |",
        "|---|---|---|---|---|---|",
    ]
    for name, subset in (("отвечаемые", ans), ("ловушки", trp)):
        ss = sorted(r["top_score"] for r in subset)
        if ss:
            q = lambda p: ss[min(len(ss) - 1, int(p * len(ss)))]
            lines.append(
                f"| {name} | {ss[0]:.3f} | {q(0.25):.3f} | {q(0.5):.3f} | {q(0.75):.3f} | {ss[-1]:.3f} |"
            )
    lines += [
        "",
        "## Сетка порога LOW (отказ без LLM)",
        "",
        "| LOW | false refusal (цель ≤5%) | false answer (цель ≤3%) |",
        "|---|---|---|",
    ]
    for low, fr, fa in grid:
        mark = " ←" if abs(low - rec_low) < 1e-9 else ""
        lines.append(f"| {low:.2f} | {pct(fr)} | {pct(fa)}{mark} |")
    lines += [
        "",
        f"## Рекомендация: THRESHOLD_LOW={rec_low:.2f}, THRESHOLD_HIGH={rec_high:.2f}",
        "",
        f"- LOW={rec_low:.2f}: максимальный порог с false refusal ≤ 5%.",
        f"- HIGH={rec_high:.2f}: p25 скоров вопросов с верным top-1 — 75% уверенных ответов без пометки.",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n📄 отчёт: {REPORT}")
    print(f"рекомендация: LOW={rec_low:.2f} HIGH={rec_high:.2f}")
    print(f"recall@5={recall_at(5, ans):.3f} (таблицы {recall_at(5, tables):.3f})")


if __name__ == "__main__":
    main()
