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
  /** Самостоятельная формулировка вопроса; при сбое возвращает исходный. */
  rewrite(question: string, history: LlmTurn[]): Promise<string>;
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
