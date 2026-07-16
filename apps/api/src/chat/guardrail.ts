import { Confidence } from "@rag/shared";

/**
 * Двухпороговая guardrail-схема (docs/01-SPEC.md), считается по score лучшего
 * чанка после reranker (нормализован в [0..1]):
 *   score < LOW           → refused  (отказ БЕЗ вызова LLM)
 *   LOW ≤ score < HIGH     → low      (ответ с пометкой о неуверенности)
 *   score ≥ HIGH           → high     (обычный ответ)
 */
export interface GuardrailThresholds {
  low: number;
  high: number;
}

export function classifyConfidence(
  topScore: number,
  { low, high }: GuardrailThresholds,
): Confidence {
  if (topScore >= high) return Confidence.High;
  if (topScore >= low) return Confidence.Low;
  return Confidence.Refused;
}

/** Нужно ли вообще звать LLM (при refused — нет, экономим токены). */
export function shouldCallLlm(confidence: Confidence): boolean {
  return confidence !== Confidence.Refused;
}
