"""Дисковый кэш эмбеддингов чанков (Фаза 0).

Энкод bge-m3 на CPU медленный (~2.7 чанк/с). Кэшируем векторы по chunk_id
инкрементально (дозапись в JSONL), чтобы:
  · повторные прогоны eval (стеммер, сравнение методов) были мгновенными;
  · прерывание длинного энкода не теряло прогресс — перезапуск продолжает с места.
"""
from __future__ import annotations

import json
from pathlib import Path

from config import DATA_DIR


def _safe(name: str) -> str:
    return name.replace("/", "_").replace("\\", "_")


def cache_path(embedder_name: str) -> Path:
    return DATA_DIR / f"emb_{_safe(embedder_name)}.jsonl"


def load_cache(embedder_name: str) -> dict[str, list[float]]:
    path = cache_path(embedder_name)
    out: dict[str, list[float]] = {}
    if not path.exists():
        return out
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            out[d["id"]] = d["v"]
    return out


def embed_chunks_cached(
    embedder,
    ids: list[str],
    texts: list[str],
    batch: int = 128,
    verbose: bool = True,
) -> list[list[float]]:
    """Возвращает векторы чанков в порядке ids, до-вычисляя и кэшируя недостающие."""
    cache = load_cache(embedder.name)
    missing = [(i, cid) for i, cid in enumerate(ids) if cid not in cache]
    if missing and verbose:
        print(f"  · кэш: {len(cache)} готово, досчитываем {len(missing)} …", flush=True)

    path = cache_path(embedder.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for start in range(0, len(missing), batch):
            part = missing[start : start + batch]
            vecs = embedder.embed([texts[i] for i, _ in part])
            for (idx, cid), v in zip(part, vecs):
                v = [float(x) for x in v]
                cache[cid] = v
                f.write(json.dumps({"id": cid, "v": v}) + "\n")
            f.flush()
            if verbose:
                done = min(start + batch, len(missing))
                print(f"    {done}/{len(missing)}", flush=True)

    return [cache[cid] for cid in ids]
