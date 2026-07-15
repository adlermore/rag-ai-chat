import type {
  LlmAnswerInput,
  LlmCompletion,
  LlmProvider,
  LlmTurn,
} from "./llm.provider";

/**
 * Stub-провайдер: НЕ генерирует текст, а собирает черновой ответ из найденных
 * чанков (с цитатами ⟨n⟩). Позволяет проверить весь пайплайн БЕЗ ключа LLM.
 */
export class StubLlmProvider implements LlmProvider {
  readonly name = "stub";

  async complete(input: LlmAnswerInput): Promise<LlmCompletion> {
    const preamble = input.lowConfidence
      ? "⚠️ Հնարավոր է պատասխանը ոչ լիարժեք լինի (թերի համատեքստ)։\n\n"
      : "";
    const body = input.contextBlocks
      .slice(0, 3)
      .map((b) => {
        const firstSentence = b.text.split(/(?<=[։:.!?])\s/)[0] ?? b.text;
        return `${firstSentence.trim()} ⟨${b.marker}⟩`;
      })
      .join(" ");
    const note =
      "\n\n[Սա սևագիր պատասխան է առանց LLM-ի. Իրական պատասխանի համար ավելացրեք LLM բանալի (OPENAI_API_KEY կամ ANTHROPIC_API_KEY)։]";
    return { text: preamble + body + note, tokensIn: null, tokensOut: null };
  }

  async *streamCompletion(
    input: LlmAnswerInput,
  ): AsyncGenerator<string, LlmCompletion, void> {
    const completion = await this.complete(input);
    for (const word of completion.text.split(/(\s+)/)) {
      if (word) yield word;
    }
    return completion;
  }

  async rewrite(question: string, _history: LlmTurn[]): Promise<string> {
    return question; // без LLM переписывание невозможно — pass-through
  }
}
