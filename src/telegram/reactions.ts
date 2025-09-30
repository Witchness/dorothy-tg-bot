export interface ReactionsAdapter {
  ok(ctx: unknown): Promise<void> | void;
  fail(ctx: unknown): Promise<void> | void;
}

export const createSimpleReactions = (): ReactionsAdapter => ({
  async ok(ctx: any) {
    try {
      if (ctx?.api?.setMessageReaction && ctx?.chat?.id && ctx?.message?.message_id) {
        await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: "emoji", emoji: "👌" }]);
      }
    } catch {
      // Swallow errors silently — no fallback message to chat
    }
  },
  async fail(ctx: any) {
    try {
      if (ctx?.api?.setMessageReaction && ctx?.chat?.id && ctx?.message?.message_id) {
        await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: "emoji", emoji: "❌" }]);
      }
    } catch {
      // Swallow errors silently — no fallback message to chat
    }
  },
});

export const createNoopReactions = (): ReactionsAdapter => ({
  ok() {},
  fail() {},
});