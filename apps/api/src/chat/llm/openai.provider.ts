import {
  buildSystemPrompt,
  buildUserPrompt,
  type LlmAnswerInput,
  type LlmProvider,
} from "./llm.provider";

/**
 * OpenAI Chat Completions через fetch (без SDK). Одиночный вызов, ответ
 * отдаётся словами для UI-стриминга. Требует OPENAI_API_KEY.
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async *streamAnswer(input: LlmAnswerInput): AsyncIterable<string> {
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...input.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: buildUserPrompt(input) },
    ];
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.2 }),
    });
    if (!resp.ok) {
      throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as {
      choices: { message: { content: string } }[];
    };
    const text = data.choices[0]?.message?.content ?? "";
    for (const word of text.split(/(\s+)/)) yield word;
  }
}
