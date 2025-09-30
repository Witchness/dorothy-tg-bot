import { describe, it, expect } from "vitest";
import { createSimpleReactions } from "../../src/telegram/reactions.js";

describe("telegram/reactions", () => {
  it("falls back to reply when setMessageReaction is unavailable (ok)", async () => {
    const reactions = createSimpleReactions();
    let replied = "";
    const ctx: any = {
      chat: { id: 1 },
      message: { message_id: 2 },
      api: {},
      reply: async (text: string) => { replied = text; },
    };
    await reactions.ok(ctx);
    expect(replied).toBe("👌");
  });

  it("falls back to reply when setMessageReaction is unavailable (fail)", async () => {
    const reactions = createSimpleReactions();
    let replied = "";
    const ctx: any = {
      chat: { id: 1 },
      message: { message_id: 2 },
      api: {},
      reply: async (text: string) => { replied = text; },
    };
    await reactions.fail(ctx);
    expect(replied).toBe("❌");
  });
});