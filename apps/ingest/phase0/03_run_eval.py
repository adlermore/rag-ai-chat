#!/usr/bin/env python3
"""
Шаг 3 Фазы 0: прогон retrieval и замер recall@k.

Сравнивает методы для каждого эмбеддера:
    dense · bm25 · hybrid(RRF) · hybrid+rerank
и проверяет критерий выхода: hybrid+rerank recall@5 >= 0.85 (docs/04-ROADMAP.md).

Использование:
    python 03_run_eval.py --embedders dummy                  # smoke-тест
    python 03_run_eval.py --embedders openai,bge-m3 --rerank  # реальное сравнение
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone

from bm25 import BM25
from common import Chunk, Question, load_chunks, load_questions
from config import CONFIG, CHUNKS_PATH, QUESTIONS_PATH, REPORTS_DIR
from dense import DenseIndex
from embedders import get_embedder
from fusion import rrf_fuse
from metrics import (
    MethodReport,
    build_report,
    passes_exit_criterion,
    rank_of_target,
)
from reranker import get_reranker


def _final_with_rerank(
    query: str,
    hybrid_ids: list[str],
    chunk_by_id: dict[str, Chunk],
    reranker,
) -> list[str]:
    """Реранкуем top_in кандидатов гибрида, хвост оставляем в исходном порядке."""
    head = hybrid_ids[: CONFIG.top_in]
    tail = hybrid_ids[CONFIG.top_in :]
    candidates = [(cid, chunk_by_id[cid].text) for cid in head]
    reranked_head = reranker.rerank(query, candidates)
    return reranked_head + tail


def evaluate_embedder(
    embedder_name: str,
    chunks: list[Chunk],
    questions: list[Question],
    use_rerank: bool,
) -> tuple[list[MethodReport], str]:
    chunk_by_id = {c.id: c for c in chunks}
    texts = [c.text for c in chunks]
    ids = [c.id for c in chunks]

    print(f"\n▶ Эмбеддер: {embedder_name}")
    embedder = get_embedder(embedder_name)
    print(f"  · эмбеддинг {len(texts)} чанков …")
    vectors = embedder.embed(texts)

    dense_index = DenseIndex(ids, vectors)
    bm25 = BM25.from_texts(texts, ids)
    reranker = get_reranker(use_rerank)

    # Оцениваем только отвечаемые вопросы (у ловушек нет целевого чанка).
    answerable = [q for q in questions if not q.must_refuse and q.target_chunk_id and q.approved]
    print(f"  · вопросов для recall: {len(answerable)}")

    ranks: dict[str, list[int | None]] = {
        "dense": [],
        "bm25": [],
        "hybrid(RRF)": [],
        f"hybrid+rerank[{reranker.name}]": [],
    }

    for q in answerable:
        target = q.target_chunk_id
        assert target is not None
        qvec = embedder.embed([q.question])[0]

        dense_ids = dense_index.search(qvec)
        bm25_ids = bm25.search(q.question)
        hybrid_ids = rrf_fuse([dense_ids, bm25_ids], k=CONFIG.rrf_k)
        final_ids = _final_with_rerank(q.question, hybrid_ids, chunk_by_id, reranker)

        ranks["dense"].append(rank_of_target(dense_ids, target))
        ranks["bm25"].append(rank_of_target(bm25_ids, target))
        ranks["hybrid(RRF)"].append(rank_of_target(hybrid_ids, target))
        ranks[f"hybrid+rerank[{reranker.name}]"].append(
            rank_of_target(final_ids, target)
        )

    reports = [build_report(name, r, CONFIG.recall_at) for name, r in ranks.items()]
    return reports, embedder.name


def _render_markdown(
    sections: list[tuple[str, list[MethodReport], bool]],
) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ks = CONFIG.recall_at
    lines = [
        "# Phase 0 — отчёт по армянскому retrieval",
        "",
        f"Сгенерировано: {ts}",
        f"Критерий выхода: hybrid+rerank recall@{CONFIG.exit_recall_at} "
        f">= {CONFIG.exit_threshold:.2f}",
        "",
    ]
    for embed_name, reports, passed in sections:
        lines.append(f"## Эмбеддер: `{embed_name}`")
        lines.append("")
        header = "| Метод | " + " | ".join(f"R@{k}" for k in ks) + " | MRR |"
        sep = "|" + "---|" * (len(ks) + 2)
        lines.append(header)
        lines.append(sep)
        for rep in reports:
            cells = " | ".join(f"{rep.recall.get(k, 0.0):.3f}" for k in ks)
            lines.append(f"| {rep.name} | {cells} | {rep.mrr:.3f} |")
        verdict = "✅ ПРОЙДЕНО" if passed else "❌ НЕ пройдено"
        lines.append("")
        lines.append(f"**Критерий выхода: {verdict}**")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Прогон retrieval Фазы 0")
    parser.add_argument(
        "--embedders",
        default="dummy",
        help="Список через запятую: dummy | openai | bge-m3",
    )
    parser.add_argument(
        "--rerank",
        action="store_true",
        help="Включить bge-reranker-v2-m3 (иначе IdentityReranker)",
    )
    args = parser.parse_args()

    if not CHUNKS_PATH.exists() or not QUESTIONS_PATH.exists():
        raise SystemExit(
            "Нет chunks.jsonl / questions.jsonl. Сначала 01_ingest.py и "
            "02_generate_questions.py (можно с --use-fixtures)."
        )

    chunks = load_chunks(CHUNKS_PATH)
    questions = load_questions(QUESTIONS_PATH)
    ks = CONFIG.recall_at

    sections: list[tuple[str, list[MethodReport], bool]] = []
    for name in [e.strip() for e in args.embedders.split(",") if e.strip()]:
        reports, resolved_name = evaluate_embedder(name, chunks, questions, args.rerank)

        print(f"\n  Результаты ({resolved_name}):")
        for rep in reports:
            print("    " + rep.recall_line(ks))

        rerank_report = reports[-1]  # hybrid+rerank
        passed = passes_exit_criterion(
            rerank_report, CONFIG.exit_recall_at, CONFIG.exit_threshold
        )
        sections.append((resolved_name, reports, passed))

    # Отчёт в файл
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / "phase0_report.md"
    report_path.write_text(_render_markdown(sections), encoding="utf-8")

    print(f"\n📄 Отчёт: {report_path}")
    print(
        f"\nКритерий выхода (recall@{CONFIG.exit_recall_at} >= "
        f"{CONFIG.exit_threshold:.2f}):"
    )
    for embed_name, _reports, passed in sections:
        print(f"  {'✅' if passed else '❌'} {embed_name}")


if __name__ == "__main__":
    main()
