"""
Генерация синтетического тестового датасета вопросов (docs/05-EVALUATION.md).

Для каждого выбранного чанка LLM формулирует на армянском:
  - 1 фактический вопрос, ответ на который есть в чанке;
  - эталонный краткий ответ.
Плюс отдельно — вопросы-ловушки (по теме, но ответа в базе нет → must_refuse).

LLM-клиент импортируется лениво; требует OPENAI_API_KEY (или ANTHROPIC_API_KEY).
"""
from __future__ import annotations

import json
import random
import uuid

from common import Chunk, Question
from config import CONFIG

_QGEN_SYSTEM = (
    "Դու օգնական ես, որ ստեղծում է ստուգողական հարցեր հայերեն փաստաթղթերի համար։ "
    "Հարցը պետք է լինի փաստացի և պատասխանելի ՄԻԱՅՆ տրված հատվածով։ "
    "Վերադարձրու JSON՝ {\"question\": ..., \"answer\": ...} ֆորմատով, հայերեն։"
)

_TRAP_SYSTEM = (
    "Ստեղծիր հայերեն հարցեր ընկերության թեմայով, որոնց պատասխանը "
    "ՄԻՏՈՒՄՆԱՎՈՐ բացակայում է տրված փաստաթղթերում։ Վերադարձրու JSON ցուցակ՝ "
    "[{\"question\": ...}, ...]։"
)


def _openai_client():
    try:
        from openai import OpenAI
    except ImportError as e:  # pragma: no cover
        raise RuntimeError(
            "pip install -r requirements-phase0.txt (нужен пакет openai)"
        ) from e
    if not CONFIG.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY не задан (см. .env).")
    return OpenAI(api_key=CONFIG.openai_api_key)


def _chat_json(client, system: str, user: str) -> str:
    resp = client.chat.completions.create(
        model=CONFIG.qgen_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or "{}"


def generate_questions(
    chunks: list[Chunk], seed: int = 42
) -> list[Question]:
    """Основной вход: строит датасет из фактических вопросов + ловушек."""
    client = _openai_client()
    rng = random.Random(seed)

    # 1) выборка 15–25% чанков под фактические вопросы
    sample_n = max(1, int(len(chunks) * CONFIG.qgen_sample_ratio))
    sample = rng.sample(chunks, min(sample_n, len(chunks)))

    questions: list[Question] = []
    for ch in sample:
        try:
            raw = _chat_json(client, _QGEN_SYSTEM, ch.text)
            data = json.loads(raw)
            q = str(data.get("question", "")).strip()
            a = str(data.get("answer", "")).strip()
            if q:
                questions.append(
                    Question(
                        id=str(uuid.uuid4()),
                        question=q,
                        expected_answer=a,
                        target_chunk_id=ch.id,
                        must_refuse=False,
                    )
                )
        except Exception as e:  # noqa: BLE001 — пропускаем сбойные генерации
            print(f"  ⚠️  пропуск чанка {ch.id[:8]}: {e}")

    # 2) вопросы-ловушки (must_refuse=True)
    try:
        context = "\n".join(f"- {c.doc_title}" for c in {c.doc_id: c for c in chunks}.values())
        raw = _chat_json(
            client,
            _TRAP_SYSTEM,
            f"Փաստաթղթեր՝\n{context}\nՍտեղծիր {CONFIG.qgen_trap_count} հարց-թակարդ։",
        )
        data = json.loads(raw)
        traps = data if isinstance(data, list) else data.get("questions", [])
        for item in traps[: CONFIG.qgen_trap_count]:
            q = str(item.get("question", "")).strip() if isinstance(item, dict) else str(item)
            if q:
                questions.append(
                    Question(
                        id=str(uuid.uuid4()),
                        question=q,
                        target_chunk_id=None,
                        must_refuse=True,
                    )
                )
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️  генерация ловушек не удалась: {e}")

    return questions
