import { describe, expect, it } from "vitest";

describe("analyzer summary boundaries", () => {
  it("exactly 160 chars returns summary without ellipsis", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const base = "a".repeat(160);
    const res = analyzeMessage({ text: base, entities: [] } as any);
    const nlp = res.nlpSection?.join("\n") ?? "";
    expect(nlp).toContain("Summary:");
    expect(nlp).not.toContain("…");
  });
});