import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AnthropicProvider } from "./anthropic.provider";
import type {
  LlmAnswerInput,
  LlmCompletion,
  LlmProvider,
  LlmTurn,
} from "./llm.provider";
import { OpenAiProvider } from "./openai.provider";
import { StubLlmProvider } from "./stub.provider";

/**
 * Выбирает LLM-провайдера по LLM_PROVIDER. Если у выбранного провайдера нет
 * ключа — деградирует до stub (пайплайн остаётся рабочим без ключа).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider: LlmProvider;

  constructor(config: ConfigService) {
    const requested = config.get<string>("LLM_PROVIDER", "stub");
    const model = config.get<string>("LLM_MODEL", "gpt-4.1-mini");
    const openaiKey = config.get<string>("OPENAI_API_KEY");
    const anthropicKey = config.get<string>("ANTHROPIC_API_KEY");

    if (requested === "openai" && openaiKey) {
      this.provider = new OpenAiProvider(openaiKey, model);
    } else if (requested === "anthropic" && anthropicKey) {
      this.provider = new AnthropicProvider(anthropicKey, model);
    } else {
      if (requested !== "stub") {
        this.logger.warn(
          `LLM_PROVIDER=${requested}, но ключ не задан → использую stub (ответы без генерации).`,
        );
      }
      this.provider = new StubLlmProvider();
    }
    this.logger.log(`LLM-провайдер: ${this.provider.name}`);
  }

  get providerName(): string {
    return this.provider.name;
  }

  complete(input: LlmAnswerInput): Promise<LlmCompletion> {
    return this.provider.complete(input);
  }

  /** Настоящий стриминг: yield — дельты текста, return — итог с usage. */
  streamCompletion(
    input: LlmAnswerInput,
  ): AsyncGenerator<string, LlmCompletion, void> {
    return this.provider.streamCompletion(input);
  }

  /** Переписывает follow-up вопрос в самостоятельный (best-effort). */
  rewrite(question: string, history: LlmTurn[]): Promise<string> {
    return this.provider.rewrite(question, history);
  }
}
