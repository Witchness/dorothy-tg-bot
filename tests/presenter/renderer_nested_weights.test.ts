import { describe, expect, it } from "vitest";
import { renderMessageHTML } from "../../src/renderer.js";

describe("renderer (nested weights)", () => {
  it("nests entities by weight order (blockquote > link > pre > code > u > i > b > spoiler)", () => {
    const text = "hello";
    const msg = {
      text,
      entities: [
        { type: "blockquote", offset: 0, length: text.length },
        { type: "text_link", offset: 0, length: text.length, url: "https://ex.com" },
        { type: "pre", offset: 0, length: text.length },
        { type: "code", offset: 0, length: text.length },
        { type: "underline", offset: 0, length: text.length },
        { type: "italic", offset: 0, length: text.length },
        { type: "bold", offset: 0, length: text.length },
        { type: "spoiler", offset: 0, length: text.length },
      ],
    } as any;
    const { html } = renderMessageHTML(msg, "html");
    // Check opening tag ordering by positions
    const pos = (s: string) => html.indexOf(s);
    expect(pos("<blockquote>")).toBeLessThan(pos("<a href=\"https://ex.com\">"));
    expect(pos("<a href=\"https://ex.com\">")).toBeLessThan(pos("<pre>"));
    expect(pos("<pre>")).toBeLessThan(pos("<code>"));
    expect(pos("<code>")).toBeLessThan(pos("<u>"));
    expect(pos("<u>")).toBeLessThan(pos("<i>"));
    expect(pos("<i>")).toBeLessThan(pos("<b>"));
    expect(pos('<span class="tg-spoiler">')).toBeGreaterThan(pos("<b>"));
  });

  it("ignores custom_emoji and unknown entity types (no-op)", () => {
    const text = "x😀y";
    const msg = {
      text,
      entities: [
        { type: "custom_emoji", offset: 1, length: 2, custom_emoji_id: "id1" },
        { type: "unknown_type", offset: 0, length: 1 },
      ],
    } as any;
    const { html } = renderMessageHTML(msg, "html");
    // No special tags should wrap around; emoji and letters remain escaped text
    expect(html).toContain("x");
    expect(html).toContain("y");
    expect(html).not.toContain("custom_emoji");
    expect(html).not.toContain("unknown_type");
    expect(html).not.toMatch(/<[^>]+>😀<\/[^>]+>/); // not wrapped
  });
});