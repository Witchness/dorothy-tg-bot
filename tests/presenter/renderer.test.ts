import { describe, expect, it } from "vitest";
import { renderMediaGroupHTML, renderMessageHTML } from "../../src/renderer.js";

describe("renderer", () => {
  it("renders message with entities, attachments and insights", () => {
    const { html, insights } = renderMessageHTML({
      text: "Hello https://example.com @user",
      entities: [
        { type: "bold", offset: 0, length: 5 },
        { type: "url", offset: 6, length: 19 },
        { type: "mention", offset: 26, length: 5 },
      ],
      photo: [{ width: 640, height: 480, file_size: 2048 }],
      video: { width: 320, height: 240, file_size: 1024 },
      document: { file_name: "doc.pdf", mime_type: "application/pdf", file_size: 1024 },
      sticker: { emoji: "😀" },
    } as any, "prefix");

    expect(html).toContain("<b>Hello</b>");
    expect(html).toContain("https://example.com");
    expect(html).toContain("📎");
    expect(html).toContain("ℹ️ Інсайти");
    expect(insights).toContain("https://example.com");
  });

  it("supports HTML quote mode", () => {
    const { html } = renderMessageHTML({
      text: "quoted",
      entities: [{ type: "blockquote", offset: 0, length: 6 }],
    } as any, "html");
    expect(html).toContain("<blockquote>");
  });

  it("renders media group attachments", () => {
    const { html } = renderMediaGroupHTML([
      { caption: "Caption", caption_entities: [{ type: "bold", offset: 0, length: 7 }], photo: [{ width: 100, height: 100 }] },
      { video: { width: 320, height: 240, file_size: 1024 } },
    ] as any);
    expect(html).toContain("<b>Caption</b>");
    expect(html).toContain("📎 Вкладення");
  });
});
