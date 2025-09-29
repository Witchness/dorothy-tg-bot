import { describe, expect, it } from "vitest";
import { renderMessageHTML } from "../../src/renderer.js";

describe("renderer (line boundaries)", () => {
  it("closes and opens tags correctly across newline with overlapping ranges", () => {
    // Text indices: 0:A 1:B 2:\n 3:C 4:D
    const text = "AB\nCD";
    // bold: [0,2), italic: [1,4) — italic spans across newline
    const entities = [
      { type: "bold", offset: 0, length: 2 },
      { type: "italic", offset: 1, length: 3 },
    ] as any[];
    const { html } = renderMessageHTML({ text, entities } as any, "html");

    const pos = (s: string) => html.indexOf(s);
    const nl = html.indexOf("\n");
    expect(nl).toBeGreaterThan(0);
    // bold should close before newline
    expect(pos("</b>")).toBeGreaterThan(0);
    expect(pos("</b>")).toBeLessThan(nl);
    // italic closes after newline (since it spans across it)
    expect(pos("</i>")).toBeGreaterThan(nl);
  });

  it("applies quote prefix at start of each line and preserves inner formatting in second line", () => {
    const text = "q1\nq2";
    const entities = [
      { type: "blockquote", offset: 0, length: text.length },
      { type: "bold", offset: 3, length: 2 }, // "q2" starts at 3
    ] as any[];
    const { html } = renderMessageHTML({ text, entities } as any, "prefix");
    const lines = html.split("\n");
    expect(lines[0].startsWith("&gt; ")).toBe(true);
    expect(lines[1].startsWith("&gt; ")).toBe(true);
    expect(lines[1]).toContain("<b>q2</b>");
  });
});