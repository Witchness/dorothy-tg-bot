import { describe, expect, it } from "vitest";
import { renderMessageHTML } from "../../src/renderer.js";

describe("renderer (more cases)", () => {
  it("text_link without url uses empty href", () => {
    const msg = {
      text: "click",
      entities: [{ type: "text_link", offset: 0, length: 5 }],
    } as any;
    const { html } = renderMessageHTML(msg, "html");
    expect(html).toContain('<a href="">');
  });

  it("text_mention without user id uses empty href", () => {
    const msg = {
      text: "@user",
      entities: [{ type: "text_mention", offset: 0, length: 5, user: {} }],
    } as any;
    const { html } = renderMessageHTML(msg, "html");
    expect(html).toContain('<a href="">');
  });
});