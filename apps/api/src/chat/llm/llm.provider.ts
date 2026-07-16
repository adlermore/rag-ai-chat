/**
 * Абстракция LLM для чата. Провайдеры: openai, anthropic, stub.
 *
 * Провайдеры возвращают ГОТОВЫЙ ответ (complete) с токен-метриками — оба API
 * вызываются без стриминга, а «стрим» словами в SSE делает ChatService.
 * Отдельно — rewrite(): переписывание follow-up вопроса в самостоятельный
 * с учётом истории диалога (обязательный шаг пайплайна, docs/01-SPEC.md).
 */

export interface LlmContextBlock {
  marker: string; // «1», «2» … — для цитатных чипов ⟨n⟩
  text: string;
}

export interface LlmTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LlmAnswerInput {
  question: string;
  contextBlocks: LlmContextBlock[];
  history: LlmTurn[];
  /** true → между порогами: ответ снабдить пометкой о неуверенности. */
  lowConfidence: boolean;
}

export interface LlmCompletion {
  text: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface LlmProvider {
  readonly name: string;
  complete(input: LlmAnswerInput): Promise<LlmCompletion>;
  /**
   * НАСТОЯЩИЙ стриминг ответа: yield — дельты текста по мере генерации
   * (первый токен пользователю через секунды), return — итог с usage.
   * Приоритет проекта — скорость ответов (TTFT).
   */
  streamCompletion(
    input: LlmAnswerInput,
  ): AsyncGenerator<string, LlmCompletion, void>;
  /** Самостоятельная формулировка вопроса; при сбое возвращает исходный. */
  rewrite(question: string, history: LlmTurn[]): Promise<string>;
}

/** Разбор SSE-потока (Anthropic/OpenAI): выдаёт JSON-объекты data-строк. */
export async function* sseJsonEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload);
        } catch {
          /* пропускаем битые фрагменты */
        }
      }
    }
  }
}

/**
 * Системная инструкция (армянский): отвечать СТРОГО по контексту, ставить
 * цитаты ⟨n⟩, при отсутствии ответа — честно сообщать (docs/01-SPEC.md).
 */
export function buildSystemPrompt(): string {
  return [
    "Դու ընկերության ներքին օգնական ես։ Պատասխանիր ՄԻԱՅՆ ներքևում տրված",
    "համատեքստի հիման վրա, հայերենով։ Եթե պատասխանը համատեքստում չկա՝ ասա,",
    "որ տեղեկությունը հասանելի փաստաթղթերում չգտնվեց։ Յուրաքանչյուր փաստ",
    "ուղեկցիր աղբյուրի հղումով ⟨n⟩ (n՝ համապատասխան հատվածի համարը)։",
    "Մի հորինիր փաստեր և մի օգտագործիր արտաքին գիտելիք։",
  ].join(" ");
}

export function buildUserPrompt(input: LlmAnswerInput): string {
  const ctx = input.contextBlocks
    .map((b) => `⟨${b.marker}⟩ ${b.text}`)
    .join("\n\n");
  const note = input.lowConfidence
    ? "\n\n(Ուշադրություն՝ համատեքստը թերի է, հնարավոր է պատասխանը ոչ լիարժեք լինի։)"
    : "";
  return `Համատեքստ՝\n${ctx}${note}\n\nՀարց՝ ${input.question}`;
}

/** Промпт переписывания follow-up вопроса в самостоятельный (армянский). */
export function buildRewritePrompt(question: string, history: LlmTurn[]): string {
  const dialog = history
    .map((t) => `${t.role === "user" ? "Օգտատեր" : "Օգնական"}: ${t.content}`)
    .join("\n");
  return [
    "Ստորև երկխոսություն է և օգտատիրոջ վերջին հարցը։ Վերաձևակերպիր վերջին",
    "հարցը որպես ԻՆՔՆՈՒՐՈՒՅՆ, համատեքստից անկախ հարց հայերենով՝ պահպանելով",
    "իմաստը։ Վերադարձրու ՄԻԱՅՆ վերաձևակերպված հարցը, առանց բացատրության։",
    "",
    `Երկխոսություն՝\n${dialog}`,
    "",
    `Վերջին հարց՝ ${question}`,
  ].join("\n");
}
