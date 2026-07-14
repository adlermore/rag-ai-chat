/**
 * Абстракция LLM для чата. Провайдеры: openai, anthropic, stub.
 * Ответ отдаётся потоком токенов (для SSE в UI).
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

export interface LlmProvider {
  readonly name: string;
  streamAnswer(input: LlmAnswerInput): AsyncIterable<string>;
}

/**
 * Системная инструкция (армянский): отвечать СТРОГО по контексту, ставить
 * цитаты ⟨n⟩, при отсутствии ответа — честно сообщать. Единый промпт для всех
 * реальных провайдеров (docs/01-SPEC.md §Guardrails).
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
