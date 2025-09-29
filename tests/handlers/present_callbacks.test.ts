import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPresentCallbacksHandler, type PresentActionEntry, type PresentBulkEntry } from "../../src/handlers/present_callbacks.js";

const makeCtx = () => {
  const calls: Record<string, any[]> = {};
  const record = (name: string) => (...args: any[]) => { calls[name] = (calls[name] ?? []).concat([args]); };
  return {
    from: { id: 42 },
    callbackQuery: { data: "" },
    replyWithPhoto: vi.fn(record("photo")),
    replyWithVideo: vi.fn(record("video")),
    replyWithDocument: vi.fn(record("document")),
    replyWithAnimation: vi.fn(record("animation")),
    replyWithAudio: vi.fn(record("audio")),
    replyWithVoice: vi.fn(record("voice")),
    replyWithVideoNote: vi.fn(record("video_note")),
    replyWithSticker: vi.fn(record("sticker")),
    answerCallbackQuery: vi.fn(async () => {}),
  } as any;
};

describe("handlers/present_callbacks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("handles present|<id> for authorized user and cleans up", async () => {
    const presentActions = new Map<string, PresentActionEntry>();
    const presentBulkActions = new Map<string, PresentBulkEntry>();
    const ctx = makeCtx();
    const timer = setTimeout(() => {}, 1000);
    const id = "abc";
    presentActions.set(id, { chatId: 1, userId: 42, payload: { kind: "photo", file_id: "p1" }, expire: Date.now() + 1000, timer });

    const mw = createPresentCallbacksHandler({ presentActions, presentBulkActions });
    ctx.callbackQuery.data = `present|${id}`;

    await mw(ctx, async () => {});
    expect(ctx.replyWithPhoto).toHaveBeenCalledWith("p1");
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    // cleanup
    expect(presentActions.has(id)).toBe(false);
  });

  it("rejects present|<id> from different user", async () => {
    const presentActions = new Map<string, PresentActionEntry>();
    const presentBulkActions = new Map<string, PresentBulkEntry>();
    const ctx = makeCtx();
    const timer = setTimeout(() => {}, 1000);
    const id = "abc";
    presentActions.set(id, { chatId: 1, userId: 100, payload: { kind: "photo", file_id: "p1" }, expire: Date.now() + 1000, timer });

    const mw = createPresentCallbacksHandler({ presentActions, presentBulkActions });
    ctx.callbackQuery.data = `present|${id}`;

    await mw(ctx, async () => {});
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringMatching(/Не дозволено/) }));
    // entry should remain (no cleanup on unauthorized)
    expect(presentActions.has(id)).toBe(true);
  });

  it("handles presentall|<id> sequence and cleans up", async () => {
    const presentActions = new Map<string, PresentActionEntry>();
    const presentBulkActions = new Map<string, PresentBulkEntry>();
    const ctx = makeCtx();
    const timer = setTimeout(() => {}, 1000);
    const id = "bulk1";
    presentBulkActions.set(id, {
      chatId: 1,
      userId: 42,
      items: [ { kind: "photo", file_id: "p1" }, { kind: "video", file_id: "v1" } ],
      expire: Date.now() + 1000,
      timer,
    });

    const mw = createPresentCallbacksHandler({ presentActions, presentBulkActions, delayMs: 0 });
    ctx.callbackQuery.data = `presentall|${id}`;

    await mw(ctx, async () => {});
    expect(ctx.replyWithPhoto).toHaveBeenCalledWith("p1");
    expect(ctx.replyWithVideo).toHaveBeenCalledWith("v1");
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(presentBulkActions.has(id)).toBe(false);
  });

  it("alerts on missing or expired id", async () => {
    const presentActions = new Map<string, PresentActionEntry>();
    const presentBulkActions = new Map<string, PresentBulkEntry>();
    const ctx = makeCtx();
    const mw = createPresentCallbacksHandler({ presentActions, presentBulkActions });

    ctx.callbackQuery.data = `present|missing`;
    await mw(ctx, async () => {});
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringMatching(/Недійсно|прострочено/) }));
  });
});
