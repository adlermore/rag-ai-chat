import {
  buildRewritePrompt,
  buildSystemPrompt,
  buildUserPrompt,
  type LlmAnswerInput,
  type LlmCompletion,
  type LlmProvider,
  type LlmTurn,
} from "./llm.provider";

interface OpenAiResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** OpenAI Chat Completions через fetch (без SDK). Требует OPENAI_API_KEY. */
export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  private async call(
    messages: { role: string; content: string }[],
    maxTokens?: number,
  ): Promise<OpenAiResponse> {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
    });
    if (!resp.ok) {
      throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
    }
    return (await resp.json()) as OpenAiResponse;
  }

  async complete(input: LlmAnswerInput): Promise<LlmCompletion> {
    const data = await this.call([
      { role: "system", content: buildSystemPrompt() },
      ...input.history.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: buildUserPrompt(input) },
    ]);
    return {
      text: data.choices[0]?.message?.content ?? "",
      tokensIn: data.usage?.prompt_tokens ?? null,
      tokensOut: data.usage?.completion_tokens ?? null,
    };
  }

  async rewrite(question: string, history: LlmTurn[]): Promise<string> {
    try {
      const data = await this.call(
        [{ role: "user", content: buildRewritePrompt(question, history) }],
        200,
      );
      const text = (data.choices[0]?.message?.content ?? "").trim();
      return text || question;
    } catch {
      return question;
    }
  }
}
