import { describe, expect, it } from "vitest";
import { InlineKeyboard } from "grammy";
import {
  buildInlineKeyboardForDiff,
  buildInlineKeyboardForScope,
  buildInlineKeyboardForNestedPayload,
  buildInlineKeyboardForMessage,
  parseRegCallback,
} from "../../src/registry_actions.js";
import type { StatusRegistryFile } from "../../src/registry_status.js";

describe("registry_actions", () => {
  const baseRegistry = (): StatusRegistryFile => ({
    version: 1,
    updatedAt: new Date().toISOString(),
    scopes: {
      message: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "" },
      edited_message: { status: "process", seen: 1, firstSeen: "", lastSeen: "" },
    },
    keysByScope: {
      message: {
        text: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "", note: "" },
        caption: { status: "process", seen: 1, firstSeen: "", lastSeen: "" },
      },
      edited_message: {
        edit_date: { status: "ignore", seen: 1, firstSeen: "", lastSeen: "" },
        caption: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "" },
      },
    },
    entityTypesByScope: {
      message: {
        mention: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "" },
        hashtag: { status: "process", seen: 1, firstSeen: "", lastSeen: "" },
      },
      edited_message: {
        mention: { status: "ignore", seen: 1, firstSeen: "", lastSeen: "" },
        bold: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "" },
      },
    },
  });

  it("builds inline keyboard for diff entries", () => {
    const diff = buildInlineKeyboardForDiff({
      newScopes: [{ scope: "message", status: "needs-review" }],
      newMessageKeys: [{ scope: "message", key: "text", status: "needs-review", sample: '"Hi"' }],
      newEntityTypes: [{ scope: "message", type: "mention", status: "needs-review" }],
    });
    expect(diff).toBeInstanceOf(InlineKeyboard);
    const rows = diff?.inline_keyboard ?? [];
    expect(rows.flat().map((b) => b.text)).toEqual(expect.arrayContaining([
      expect.stringContaining("scope: message"),
      expect.stringContaining("key: message.text"),
      expect.stringContaining("type: message.mention"),
    ]));
  });

  it("indicates overflow when exceeding row cap", () => {
    const largeDiff = buildInlineKeyboardForDiff({
      newScopes: Array.from({ length: 15 }, (_, i) => ({ scope: `scope${i}`, status: "needs-review" })),
    });
    expect(largeDiff).toBeInstanceOf(InlineKeyboard);
    const texts = (largeDiff?.inline_keyboard ?? []).flat().map((btn) => btn.text);
    expect(texts.some((t) => t.startsWith("+"))).toBe(true);
  });

  it("parses callback data correctly", () => {
    expect(parseRegCallback("reg|s|message|process")).toEqual({ kind: "s", scope: "message", status: "process" });
    expect(parseRegCallback("reg|k|message|text|ignore")).toEqual({ kind: "k", scope: "message", name: "text", status: "ignore" });
    expect(parseRegCallback("reg|t|message|mention|needs-review")).toEqual({ kind: "t", scope: "message", name: "mention", status: "needs-review" });
    expect(parseRegCallback("reg|t|message|mention|note")).toEqual({ kind: "t", scope: "message", name: "mention", status: "note" as any });
    expect(parseRegCallback("bad" as any)).toBeNull();
    expect(parseRegCallback("reg|k|message|text" as any)).toBeNull();
  });

  it("builds scope keyboards excluding processed entries", () => {
    const kb = buildInlineKeyboardForScope("message", baseRegistry());
    expect(kb).toBeInstanceOf(InlineKeyboard);
    const labels = (kb?.inline_keyboard ?? []).flat().map((btn) => btn.text);
    expect(labels.some((text) => text.includes("key: message.text"))).toBe(true);
    expect(labels.every((text) => !text.includes("caption"))).toBe(true);
  });

  it("creates nested payload keyboard for reply chains", () => {
    const kb = buildInlineKeyboardForNestedPayload("message.reply_to_message", ["text", "photo"], baseRegistry());
    expect(kb).toBeInstanceOf(InlineKeyboard);
    const labels = (kb?.inline_keyboard ?? []).flat().map((btn) => btn.text);
    expect(labels.some((text) => text.includes("message.reply_to_message"))).toBe(true);
    expect(labels.some((text) => text.includes("key: message.text"))).toBe(true);
  });

  it("builds message keyboard honoring mode", () => {
    const reg = baseRegistry();
    const kbDev = buildInlineKeyboardForMessage("message", ["text", "caption"], ["mention", "hashtag"], reg, "dev", { text: '"Hi"' });
    expect(kbDev).toBeInstanceOf(InlineKeyboard);
    const devLabels = (kbDev?.inline_keyboard ?? []).flat().map((btn) => btn.text);
    expect(devLabels.some((text) => text.includes("key: message.text"))).toBe(true);
    expect(devLabels.every((text) => !text.includes("hashtag"))).toBe(true);

    const kbDebug = buildInlineKeyboardForMessage("message", ["text"], ["mention"], reg, "debug");
    expect(kbDebug).toBeInstanceOf(InlineKeyboard);
    const debugLabels = (kbDebug?.inline_keyboard ?? []).flat().map((btn) => btn.text);
    expect(debugLabels.some((text) => text.includes("type: message.mention"))).toBe(true);
  });
});
