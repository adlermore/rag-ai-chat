"""
Reranker bge-reranker-v2-m3 (мультиязычный, CPU). Подтверждён в Фазе 0
(+0.12 R@1, +0.10 MRR). Без FlagEmbedding — IdentityReranker (порядок сохраняется).
"""
from __future__ import annotations

import os
from typing import Protocol

from ..config import get_config


class Reranker(Protocol):
    name: str

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        ...

    def rerank_scored(
        self, query: str, candidates: list[tuple[str, str]]
    ) -> list[tuple[str, float]]:
        """Как rerank, но с оценкой релевантности (сигнал для guardrail)."""
        ...


class IdentityReranker:
    name = "identity(no-rerank)"

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        return [cid for cid, _ in candidates]

    def rerank_scored(
        self, query: str, candidates: list[tuple[str, str]]
    ) -> list[tuple[str, float]]:
        # Синтетический убывающий скор (без модели осмысленного скора нет).
        n = len(candidates)
        return [(cid, (n - i) / n) for i, (cid, _) in enumerate(candidates)]


class BgeReranker:
    """bge-reranker-v2-m3 через FlagEmbedding.FlagReranker (CPU)."""

    def __init__(self) -> None:
        cfg = get_config()
        self.name = "BAAI/bge-reranker-v2-m3"
        from FlagEmbedding import FlagReranker  # ленивый импорт

        self._model = FlagReranker(self.name, use_fp16=False, devices=cfg.device)

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        return [cid for cid, _ in self.rerank_scored(query, candidates)]

    def rerank_scored(
        self, query: str, candidates: list[tuple[str, str]]
    ) -> list[tuple[str, float]]:
        if not candidates:
            return []
        pairs = [[query, text] for _, text in candidates]
        scores = self._model.compute_score(pairs, normalize=True)
        if not isinstance(scores, list):
            scores = [scores]
        order = sorted(range(len(candidates)), key=lambda i: scores[i], reverse=True)
        return [(candidates[i][0], float(scores[i])) for i in order]


class OnnxReranker:
    """bge-reranker-v2-m3 в ONNX Runtime с динамическим int8 (CPU 2–4× быстрее).

    Скор = sigmoid(logit) — та же нормализация, что у FlagReranker
    (normalize=True): пороги guardrail (LOW/HIGH) остаются сопоставимыми.
    Модель экспортируется/квантуется лениво в HF_HOME (volume) при первом
    использовании (см. onnx_export.py).
    """

    def __init__(self) -> None:
        import math

        import onnxruntime as ort
        from transformers import AutoTokenizer

        from .onnx_export import export_quantized

        self.name = "bge-reranker-v2-m3[onnx-int8]"
        model_dir = export_quantized()
        self._tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(os.environ.get("OMP_NUM_THREADS", "0")) or None or 0
        self._session = ort.InferenceSession(
            str(model_dir / "model_quantized.onnx"),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self._sigmoid = lambda x: 1.0 / (1.0 + math.exp(-x))

    def _scores(self, query: str, texts: list[str]) -> list[float]:
        enc = self._tokenizer(
            [query] * len(texts),
            texts,
            padding=True,
            truncation="only_second",  # режем только хвост пассажа
            max_length=512,
            return_tensors="np",
        )
        feed = {k: v for k, v in enc.items() if k in {i.name for i in self._session.get_inputs()}}
        logits = self._session.run(None, feed)[0]  # (n, 1)
        return [self._sigmoid(float(l[0])) for l in logits]

    def rerank(self, query: str, candidates: list[tuple[str, str]]) -> list[str]:
        return [cid for cid, _ in self.rerank_scored(query, candidates)]

    def rerank_scored(
        self, query: str, candidates: list[tuple[str, str]]
    ) -> list[tuple[str, float]]:
        if not candidates:
            return []
        scores = self._scores(query, [text for _, text in candidates])
        order = sorted(range(len(candidates)), key=lambda i: scores[i], reverse=True)
        return [(candidates[i][0], scores[i]) for i in order]


def get_reranker(use_model: bool = True) -> Reranker:
    if not use_model:
        return IdentityReranker()
    backend = os.environ.get("RERANKER_BACKEND", "onnx-int8")
    if backend == "onnx-int8":
        try:
            return OnnxReranker()
        except Exception as e:  # noqa: BLE001 — надёжный fallback на torch
            print(f"⚠️  ONNX-reranker недоступен ({e}) — fallback на torch.", flush=True)
    try:
        return BgeReranker()
    except ImportError:
        return IdentityReranker()
