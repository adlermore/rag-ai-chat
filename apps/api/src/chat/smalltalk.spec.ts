import { detectSmallTalk } from "./smalltalk";

describe("detectSmallTalk", () => {
  it("распознаёт приветствия (в т.ч. с армянским ? и регистром)", () => {
    expect(detectSmallTalk("Բարև")?.intent).toBe("greeting");
    expect(detectSmallTalk("բարև ձեզ")?.intent).toBe("greeting");
    expect(detectSmallTalk("Ողջույն։")?.intent).toBe("greeting");
    expect(detectSmallTalk("Բարի օր")?.intent).toBe("greeting");
    expect(detectSmallTalk("Hello")?.intent).toBe("greeting");
    expect(detectSmallTalk("привет")?.intent).toBe("greeting");
  });

  it("распознаёт благодарность/прощание/«что умеешь»", () => {
    expect(detectSmallTalk("Շնորհակալ եմ")?.intent).toBe("thanks");
    expect(detectSmallTalk("մերսի")?.intent).toBe("thanks");
    expect(detectSmallTalk("Ցտեսություն")?.intent).toBe("goodbye");
    expect(detectSmallTalk("Ի՞նչ ես կարող անել")?.intent).toBe("capability");
    expect(detectSmallTalk("Ո՞վ ես")?.intent).toBe("capability");
  });

  it("возвращает готовый армянский ответ", () => {
    expect(detectSmallTalk("բարև")?.reply).toContain("Բարև Ձեզ");
  });

  it("НЕ перехватывает предметные вопросы (уходят в RAG)", () => {
    expect(detectSmallTalk("Քանի՞ օր է հղիության արձակուրդը")).toBeNull();
    // приветствие + реальный вопрос — это уже вопрос, не small talk
    expect(detectSmallTalk("Բարև, քանի՞ օր է արձակուրդը")).toBeNull();
    expect(detectSmallTalk("")).toBeNull();
    expect(detectSmallTalk("   ")).toBeNull();
  });
});
