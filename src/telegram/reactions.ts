export interface ReactionsAdapter {
  ok(ctx: unknown): Promise<void> | void;
  fail(ctx: unknown): Promise<void> | void;
}

export const createSimpleReactions = (apiInstance: any): ReactionsAdapter => ({
  async ok(ctx: any) {
    try {
      const chatId = ctx?.chat?.id ?? ctx?.chatId;
      const messageId = ctx?.message?.message_id ?? ctx?.messageId;
      
      if (!apiInstance?.setMessageReaction) {
        console.warn("[reactions.ok] API instance does not have setMessageReaction method");
        return;
      }
      if (!chatId || !messageId) {
        console.warn("[reactions.ok] Missing chatId or messageId", { chatId, messageId });
        return;
      }
      await apiInstance.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: "❤" }], { is_big: false });
      console.info(`[reactions.ok] ✅ Set ❤️ reaction on chat=${chatId} msg=${messageId}`);
    } catch (e) {
      console.warn("[reactions.ok] Failed to set reaction (non-critical)", e);
    }
  },
  async fail(ctx: any) {
    try {
      const chatId = ctx?.chat?.id ?? ctx?.chatId;
      const messageId = ctx?.message?.message_id ?? ctx?.messageId;
      
      if (!apiInstance?.setMessageReaction) {
        console.warn("[reactions.fail] API instance does not have setMessageReaction method");
        return;
      }
      if (!chatId || !messageId) {
        console.warn("[reactions.fail] Missing chatId or messageId", { chatId, messageId });
        return;
      }
      await apiInstance.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: "👎" }], { is_big: false });
      console.error(`[reactions.fail] ❌ Set 👎 reaction on chat=${chatId} msg=${messageId}`);
    } catch (e) {
      console.warn("[reactions.fail] Failed to set reaction (non-critical)", e);
    }
  },
});

export const createNoopReactions = (): ReactionsAdapter => ({
  ok() {},
  fail() {},
});