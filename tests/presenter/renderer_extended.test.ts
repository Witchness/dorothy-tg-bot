import { describe, expect, it } from "vitest";
import { renderMessageHTML } from "../../src/renderer.js";

describe("renderer (extended)", () => {
  it("wraps text_link and text_mention entities", () => {
    const msg = {
      text: "click @Ada",
      entities: [
        { type: "text_link", offset: 0, length: 5, url: "https://example.com" },
        { type: "text_mention", offset: 6, length: 4, user: { id: 123 } },
      ],
    } as any;
    const { html } = renderMessageHTML(msg, "html");
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toContain('<a href="tg://user?id=123">');
  });

  it("renders expandable_blockquote in html mode", () => {
    const text = "quote";
    const { html } = renderMessageHTML({
      text,
      entities: [{ type: "expandable_blockquote", offset: 0, length: text.length }],
    } as any, "html");
    expect(html).toContain('<blockquote expandable="true">');
  });

  it("renders prefix quotes per line in prefix mode", () => {
    const text = "line1\nline2";
    const { html } = renderMessageHTML({
      text,
      entities: [{ type: "blockquote", offset: 0, length: text.length }],
    } as any, "prefix");
    const lines = html.split("\n");
    expect(lines[0].startsWith("&gt; ")).toBe(true);
    expect(lines[1].startsWith("&gt; ")).toBe(true);
  });
});