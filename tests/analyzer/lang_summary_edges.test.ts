import { describe, expect, it } from "vitest";

describe("analyzer language and summary edges", () => {
  it("detects Ukrainian (Cyrillic dominant)", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const text = "Привіт це тестове повідомлення без англійських слів"; // >10 кирилиць
    const res = analyzeMessage({ text, entities: [] } as any);
    const insights = res.nlpSection ?? [];
    expect(insights.join("\n")).toContain("Ukrainian");
  });

  it("detects English/Latin", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const text = "This is a long english text without Cyrillic letters at all here"; // >10 латиниці
    const res = analyzeMessage({ text, entities: [] } as any);
    const insights = res.nlpSection ?? [];
    expect(insights.join("\n")).toContain("English/Latin");
  });

  it("detects mixed when counts are close", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    // Balance Latin and Cyrillic counts within 20%
    const latin = "HelloHello"; // 10 Latin letters
    const cyr = "ПривітПриві"; // 11 Cyrillic letters
    const text = `${latin} ${cyr}`;
    const res = analyzeMessage({ text, entities: [] } as any);
    const insights = res.nlpSection ?? [];
    expect(insights.join("\n")).toContain("mixed");
  });

  it("summary trims long text with sentences", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const text = "Sentence one. Sentence two is quite long. And sentence three continues even more. ".repeat(4);
    const res = analyzeMessage({ text, entities: [] } as any);
    const nlp = res.nlpSection?.join("\n") ?? "";
    expect(nlp).toContain("Summary:");
    expect(nlp.length).toBeGreaterThan(0);
  });

  it("summary falls back when no punctuation and is very long", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const text = "a".repeat(200);
    const res = analyzeMessage({ text, entities: [] } as any);
    const nlp = res.nlpSection?.join("\n") ?? "";
    expect(nlp).toContain("Summary:");
    // Expect ellipsis in fallback
    expect(nlp).toContain("…");
  });

  it("language classification requires enough letters; short text yields no guess", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const text = "Hi"; // too short
    const res = analyzeMessage({ text, entities: [] } as any);
    const nlp = res.nlpSection?.join("\n") ?? "";
    expect(nlp).not.toContain("Language guess");
  });
});