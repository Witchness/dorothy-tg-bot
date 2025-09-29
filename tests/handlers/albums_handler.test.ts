import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlbumHandler } from "../../src/handlers/albums.js";

const makeCtx = () => ({
  chat: { id: 1 },
  message: { message_id: 10, media_group_id: "g1", caption: "Hello", caption_entities: [], photo: [{ width: 100, height: 100 }] },
  session: { totalMessages: 0, history: [], presentMode: false, presentQuotes: "prefix" },
  reply: vi.fn(async () => {}),
});

const statusRegistry = {
  getMessageKeyStatus: vi.fn(() => "process"),
  getMode: vi.fn(() => "dev"),
} as any;

describe("handlers/albums", () => {
  beforeEach(() => vi.useFakeTimers());

  it("buffers media_group and flushes once after holdMs", async () => {
    const replySafe = vi.fn(async () => {});
    const handler = createAlbumHandler({
      statusRegistry,
      mediaGroupHoldMs: 20,
      presentQuotesDefault: "prefix",
      replySafe,
      registerPresentAction: () => "id",
      registerPresentBulk: () => "bulk",
    });

    const ctx1 = makeCtx();
    ctx1.session.presentMode = true;
    handler.handle(ctx1 as any);

    const ctx2 = makeCtx();
    ctx2.message.message_id = 11;
    handler.handle(ctx2 as any);

    await vi.advanceTimersByTimeAsync(25);

    // replySafe used for analysis/summary output
    expect(replySafe).toHaveBeenCalled();
  });
});