"""
Армянская токенизация и лёгкий стемминг для BM25.

⚠️ Стеммер — УПРОЩЁННЫЙ СТАБ (отсечение частых суффиксов), перенесён из Фазы 0.
Перед продом заменить на полноценный армянский анализатор (Snowball 'armenian' /
Lucene ArmenianAnalyzer) и сравнить recall (открытый хвост, docs/04-ROADMAP.md).
"""
from __future__ import annotations

import re

# Армянские буквы + дефис U+058A, плюс латиница/цифры (домен-термины, коды).
_TOKEN_RE = re.compile(r"[Ա-Ֆա-ևա-ևa-zA-Z0-9]+")

# Частые словоизменительные суффиксы (длинные — раньше коротких).
_SUFFIXES: tuple[str, ...] = (
    "ներում", "ներից", "ներով", "ներին", "ների", "ներ",
    "երում", "երից", "երով", "երին", "երը", "եր",
    "ության", "ությունը", "ություն",
    "ում", "ից", "ով", "ին", "ից", "ի", "ը", "ն", "ս", "դ",
)

_MIN_STEM_LEN = 3


def tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text)]


def stem(token: str) -> str:
    for suf in _SUFFIXES:
        if token.endswith(suf) and len(token) - len(suf) >= _MIN_STEM_LEN:
            return token[: -len(suf)]
    return token


def analyze(text: str) -> list[str]:
    """Токенизация + стемминг — то, что индексирует BM25."""
    return [stem(t) for t in tokenize(text)]
