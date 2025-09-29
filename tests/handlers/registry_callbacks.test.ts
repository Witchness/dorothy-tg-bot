import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryCallbacksHandler, type ParsedRegAction } from "../../src/handlers/registry_callbacks.js";

const makeCtx = () => ({
  callbackQuery: { data: "", message: { message_id: 10, text: "- scope: message\n- keys: text, photo\n- entity types: mention" } },
  answerCallbackQuery: vi.fn(async () => {}),
  editMessageReplyMarkup: vi.fn(async () => {}),
  reply: vi.fn(async () => {}),
  session: {},
} as any);

describe("handlers/registry_callbacks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("applies status for key and updates keyboard", async () => {
    const ctx = makeCtx();
    const deps = {
      parseRegCallback: vi.fn<(d: string) => ParsedRegAction | null>(() => ({ kind: "k", scope: "message", name: "text", status: "process" })),
      setStatus: vi.fn(),
      setNote: vi.fn(),
      statusRegistry: {
        getMode: vi.fn(() => "dev" as const),
        snapshot: vi.fn(() => ({ keysByScope: { message: { text: { status: "process" }, photo: { status: "needs-review" } } }, entityTypesByScope: { message: {} } })),
        setScopeStatus: vi.fn(),
        setMessageKeyStatus: vi.fn(),
        setEntityTypeStatus: vi.fn(),
      },
      buildInlineKeyboardForMessage: vi.fn(() => ({ inline_keyboard: [] })),
    } as any;

    const mw = createRegistryCallbacksHandler(deps);
    ctx.callbackQuery.data = "reg|k|message|text|process";
    await mw(ctx, async () => {});

    expect(deps.setStatus).toHaveBeenCalledWith("key", "message", "text", "process");
    expect(deps.statusRegistry.setMessageKeyStatus).toHaveBeenCalledWith("message", "text", "process");
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("Updated:") }));
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith({ reply_markup: expect.any(Object) });
  });

  it("sets pending note and prompts on note action", async () => {
    const ctx = makeCtx();
    const deps = {
      parseRegCallback: vi.fn<(d: string) => ParsedRegAction | null>(() => ({ kind: "t", scope: "message", name: "mention", status: "note" as any })),
      setStatus: vi.fn(),
      setNote: vi.fn(),
      statusRegistry: {
        getMode: vi.fn(() => "dev" as const),
        snapshot: vi.fn(() => ({ keysByScope: {}, entityTypesByScope: {} })),
        setScopeStatus: vi.fn(),
        setMessageKeyStatus: vi.fn(),
        setEntityTypeStatus: vi.fn(),
      },
      buildInlineKeyboardForMessage: vi.fn(() => null),
    } as any;

    const mw = createRegistryCallbacksHandler(deps);
    ctx.callbackQuery.data = "reg|t|message|mention|note";
    await mw(ctx, async () => {});

    expect(ctx.session.pendingNote).toEqual({ kind: "t", scope: "message", name: "mention" });
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/Введіть нотатку/), expect.any(Object));
  });

  it("passes through on invalid payload", async () => {
    const ctx = makeCtx();
    const deps = {
      parseRegCallback: vi.fn(() => null),
      setStatus: vi.fn(),
      setNote: vi.fn(),
      statusRegistry: {
        getMode: vi.fn(() => "dev" as const),
        snapshot: vi.fn(() => ({})),
        setScopeStatus: vi.fn(),
        setMessageKeyStatus: vi.fn(),
        setEntityTypeStatus: vi.fn(),
      },
      buildInlineKeyboardForMessage: vi.fn(() => null),
    } as any;

    const next = vi.fn(async () => {});
    const mw = createRegistryCallbacksHandler(deps);
    ctx.callbackQuery.data = "reg|bad";
    await mw(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
  });
});
