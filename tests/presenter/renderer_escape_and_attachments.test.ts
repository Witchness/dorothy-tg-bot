import { describe, expect, it } from "vitest";
import { renderMessageHTML, renderMediaGroupHTML } from "../../src/renderer.js";

describe("renderer (escape & attachments)", () => {
  it("escapes HTML special characters in text", () => {
    const text = "<tag> & \"quoted\"";
    const { html } = renderMessageHTML({ text } as any, "html");
    expect(html).toContain("&lt;tag&gt; &amp; &quot;quoted&quot;");
  });

  it("adds GIF attachment for animation in single message", () => {
    const msg = { animation: { width: 320, height: 240, file_size: 2048 } } as any;
    const { html } = renderMessageHTML(msg, "prefix");
    expect(html).toContain("GIF 320×240 (2.0 КБ)");
  });

  it("includes animation inside media group attachments", () => {
    const items = [
      { photo: [{ width: 100, height: 100 }] },
      { animation: { width: 320, height: 240, file_size: 2048 } },
    ] as any[];
    const { html } = renderMediaGroupHTML(items, "prefix");
    expect(html).toContain("GIF 320×240 (2.0 КБ)");
  });
});