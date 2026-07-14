import {
  buildSystemPrompt,
  buildUserPrompt,
  type LlmAnswerInput,
  type LlmProvider,
} from "./llm.provider";

/**
 * Anthropic Messages API через fetch (без SDK). Требует ANTHROPIC_API_KEY.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async *streamAnswer(input: LlmAnswerInput): AsyncIterable<string> {
    const messages = [
      ...input.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: buildUserPrompt(input) },
    ];
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: buildSystemPrompt(),
        messages,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as { content: { text?: string }[] };
    const text = data.content.map((c) => c.text ?? "").join("");
    for (const word of text.split(/(\s+)/)) yield word;
  }
}
