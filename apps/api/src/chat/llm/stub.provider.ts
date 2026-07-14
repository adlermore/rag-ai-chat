import type { LlmAnswerInput, LlmProvider } from "./llm.provider";

/**
 * Stub-провайдер: НЕ генерирует текст, а собирает черновой ответ из найденных
 * чанков (с цитатами ⟨n⟩). Позволяет проверить весь пайплайн (retrieval →
 * guardrail → источники → сохранение → UI) БЕЗ ключа LLM. При наличии ключа
 * заменяется на openai/anthropic (см. llm.factory).
 */
export class StubLlmProvider implements LlmProvider {
  readonly name = "stub";

  async *streamAnswer(input: LlmAnswerInput): AsyncIterable<string> {
    const preamble = input.lowConfidence
      ? "⚠️ Հնարավոր է պատասխանը ոչ լիարժեք լինի (թերի համատեքստ)։\n\n"
      : "";
    // Черновой ответ: первое предложение каждого топ-чанка + цитата.
    const body = input.contextBlocks
      .slice(0, 3)
      .map((b) => {
        const firstSentence = b.text.split(/(?<=[։:.!?])\s/)[0] ?? b.text;
        return `${firstSentence.trim()} ⟨${b.marker}⟩`;
      })
      .join(" ");
    const note =
      "\n\n[Սա սևագիր պատասխան է առանց LLM-ի. Իրական պատասխանի համար ավելացրեք LLM բանալի (OPENAI_API_KEY կամ ANTHROPIC_API_KEY)։]";

    // Отдаём «потоком» словами, чтобы UI-стриминг был виден.
    for (const word of (preamble + body + note).split(/(\s+)/)) {
      yield word;
    }
  }
}
