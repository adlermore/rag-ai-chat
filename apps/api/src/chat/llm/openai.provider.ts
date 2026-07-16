import {
  buildRewritePrompt,
  buildSystemPrompt,
  buildUserPrompt,
  sseJsonEvents,
  type LlmAnswerInput,
  type LlmCompletion,
  type LlmProvider,
  type LlmTurn,
} from "./llm.provider";

interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

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

  async *streamCompletion(
    input: LlmAnswerInput,
  ): AsyncGenerator<string, LlmCompletion, void> {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          ...input.history.map((t) => ({ role: t.role, content: t.content })),
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
    }

    let text = "";
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    for await (const raw of sseJsonEvents(resp.body)) {
      const e = raw as OpenAiStreamChunk;
      const delta = e.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        yield delta;
      }
      if (e.usage) {
        tokensIn = e.usage.prompt_tokens ?? null;
        tokensOut = e.usage.completion_tokens ?? null;
      }
    }
    return { text, tokensIn, tokensOut };
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
