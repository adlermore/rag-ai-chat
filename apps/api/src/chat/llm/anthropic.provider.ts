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

interface AnthropicStreamEvent {
  type: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { text?: string };
  usage?: { output_tokens?: number };
}

interface AnthropicResponse {
  content: { text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Anthropic Messages API через fetch (без SDK). Требует ANTHROPIC_API_KEY. */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  private async call(
    system: string,
    messages: { role: string; content: string }[],
    maxTokens: number,
  ): Promise<AnthropicResponse> {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
    }
    return (await resp.json()) as AnthropicResponse;
  }

  async complete(input: LlmAnswerInput): Promise<LlmCompletion> {
    const data = await this.call(
      buildSystemPrompt(),
      [
        ...input.history.map((t) => ({ role: t.role, content: t.content })),
        { role: "user", content: buildUserPrompt(input) },
      ],
      1024,
    );
    return {
      text: data.content.map((c) => c.text ?? "").join(""),
      tokensIn: data.usage?.input_tokens ?? null,
      tokensOut: data.usage?.output_tokens ?? null,
    };
  }

  async *streamCompletion(
    input: LlmAnswerInput,
  ): AsyncGenerator<string, LlmCompletion, void> {
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
        stream: true,
        system: buildSystemPrompt(),
        messages: [
          ...input.history.map((t) => ({ role: t.role, content: t.content })),
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
    }

    let text = "";
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    for await (const raw of sseJsonEvents(resp.body)) {
      const e = raw as AnthropicStreamEvent;
      if (e.type === "message_start") {
        tokensIn = e.message?.usage?.input_tokens ?? null;
      } else if (e.type === "content_block_delta" && e.delta?.text) {
        text += e.delta.text;
        yield e.delta.text;
      } else if (e.type === "message_delta" && e.usage?.output_tokens != null) {
        tokensOut = e.usage.output_tokens;
      }
    }
    return { text, tokensIn, tokensOut };
  }

  async rewrite(question: string, history: LlmTurn[]): Promise<string> {
    try {
      const data = await this.call(
        "Դու հարցերի վերաձևակերպման օգնական ես։",
        [{ role: "user", content: buildRewritePrompt(question, history) }],
        200,
      );
      const text = data.content.map((c) => c.text ?? "").join("").trim();
      return text || question;
    } catch {
      return question; // rewrite — best-effort, при сбое ищем по исходному
    }
  }
}
