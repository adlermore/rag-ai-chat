"""
Армянская токенизация и лёгкий стемминг для BM25.

⚠️ Стеммер здесь — УПРОЩЁННЫЙ СТАБ (отсечение частых суффиксов). Задача Фазы 0 —
проверить, не ломает ли стемминг доменные термины (docs/02-ARCHITECTURE.md, строка
про Snowball hy). Перед продакшеном заменить на полноценный армянский анализатор
(Snowball 'armenian' / Lucene ArmenianAnalyzer) и сравнить recall.
"""
from __future__ import annotations

import re

# Армянские буквы: U+0531–U+0556 (заглавные), U+0561–U+0587 (строчные), U+058A дефис.
_TOKEN_RE = re.compile(r"[Ա-Ֆա-ևա-ևa-zA-Z0-9]+")

# Частые словоизменительные суффиксы армянского (длинные — раньше коротких).
# Стаб: покрывает мн. число, определённый артикль, часть падежных окончаний.
_SUFFIXES: tuple[str, ...] = (
    "ներում", "ներից", "ներով", "ներին", "ների", "ներ",
    "երում", "երից", "երով", "երին", "երը", "եր",
    "ության", "ությունը", "ություն",
    "ում", "ից", "ով", "ին", "ից", "ի", "ը", "ն", "ս", "դ",
)

_MIN_STEM_LEN = 3


def tokenize(text: str) -> list[str]:
    """Разбивает текст на нормализованные (lowercase) токены."""
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text)]


def stem(token: str) -> str:
    """Отсекает один частый суффикс, если основа остаётся достаточно длинной."""
    for suf in _SUFFIXES:
        if token.endswith(suf) and len(token) - len(suf) >= _MIN_STEM_LEN:
            return token[: -len(suf)]
    return token


def analyze(text: str) -> list[str]:
    """Полный конвейер: токенизация + стемминг (то, что индексирует BM25)."""
    return [stem(t) for t in tokenize(text)]
