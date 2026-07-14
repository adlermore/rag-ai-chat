import { Confidence } from "@rag/shared";
import { classifyConfidence, shouldCallLlm } from "./guardrail";

describe("classifyConfidence", () => {
  const t = { low: 0.35, high: 0.62 };

  it("score выше верхнего порога → high", () => {
    expect(classifyConfidence(0.977, t)).toBe(Confidence.High);
    expect(classifyConfidence(0.62, t)).toBe(Confidence.High); // граница включительно
  });

  it("между порогами → low", () => {
    expect(classifyConfidence(0.5, t)).toBe(Confidence.Low);
    expect(classifyConfidence(0.35, t)).toBe(Confidence.Low); // нижняя граница
    expect(classifyConfidence(0.619, t)).toBe(Confidence.Low);
  });

  it("ниже нижнего порога → refused", () => {
    expect(classifyConfidence(0.0, t)).toBe(Confidence.Refused);
    expect(classifyConfidence(0.349, t)).toBe(Confidence.Refused);
  });

  it("shouldCallLlm: не зовём LLM при отказе", () => {
    expect(shouldCallLlm(Confidence.Refused)).toBe(false);
    expect(shouldCallLlm(Confidence.Low)).toBe(true);
    expect(shouldCallLlm(Confidence.High)).toBe(true);
  });
});
