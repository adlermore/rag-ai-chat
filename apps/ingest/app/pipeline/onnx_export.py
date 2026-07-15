"""
Экспорт reranker'а в ONNX + динамическое int8-квантование (CPU-ускорение 2–4×).

Одноразовая операция: результат кладётся в <HF_HOME>/onnx-reranker-int8 (volume
в Docker) и переиспользуется. Вызывается лениво из OnnxReranker при первом
старте, либо вручную:
    PYTHONPATH=. python app/pipeline/onnx_export.py
"""
from __future__ import annotations

import os
import platform
from pathlib import Path

DEFAULT_MODEL = "BAAI/bge-reranker-v2-m3"


def onnx_dir() -> Path:
    base = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    return base / "onnx-reranker-int8"


def export_quantized(model_id: str = DEFAULT_MODEL, out: Path | None = None) -> Path:
    """Экспортирует модель в ONNX и квантует в int8. Идемпотентно."""
    out = out or onnx_dir()
    quant_file = out / "model_quantized.onnx"
    if quant_file.exists():
        return out

    # torch>=2.9 по умолчанию использует dynamo-экспортер, чей формат артефактов
    # несовместим с optimum 1.23 (FileNotFoundError model.onnx.data) — форсируем
    # классический TorchScript-экспортер.
    import torch.onnx as _torch_onnx

    _orig_export = _torch_onnx.export

    def _legacy_export(*args, **kwargs):  # noqa: ANN002, ANN003
        kwargs["dynamo"] = False
        return _orig_export(*args, **kwargs)

    _torch_onnx.export = _legacy_export

    from optimum.onnxruntime import ORTModelForSequenceClassification, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from transformers import AutoTokenizer

    print(f"[onnx] экспорт {model_id} → {out} …", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    model = ORTModelForSequenceClassification.from_pretrained(model_id, export=True)
    model.save_pretrained(out)
    AutoTokenizer.from_pretrained(model_id).save_pretrained(out)

    # Динамическое int8: конфиг под архитектуру CPU (arm64 — Apple/Graviton,
    # avx512_vnni — современные x86-серверы; целевая среда — linux-сервер).
    arch = platform.machine().lower()
    qconfig = (
        AutoQuantizationConfig.arm64(is_static=False, per_channel=False)
        if arch in ("arm64", "aarch64")
        else AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    )
    print(f"[onnx] int8-квантование ({arch}) …", flush=True)
    quantizer = ORTQuantizer.from_pretrained(out)
    quantizer.quantize(save_dir=out, quantization_config=qconfig)
    print(f"[onnx] готово: {quant_file}", flush=True)
    return out


if __name__ == "__main__":
    export_quantized()
