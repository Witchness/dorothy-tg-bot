export const MINIMAL_UPDATES_9_2 = [
  "message",
  "edited_message",
  "callback_query",
] as const;

export type MinimalUpdate = (typeof MINIMAL_UPDATES_9_2)[number];

// Comprehensive list according to @grammyjs/types Update interface (matches Bot API recent versions)
export const ALL_UPDATES_9_2 = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
  "message_reaction",
  "message_reaction_count",
  "inline_query",
  "chosen_inline_result",
  "callback_query",
  "shipping_query",
  "pre_checkout_query",
  "poll",
  "poll_answer",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "chat_boost",
  "removed_chat_boost",
  "purchased_paid_media",
] as const;

export type AllUpdate = (typeof ALL_UPDATES_9_2)[number];

// Delay window to aggregate Telegram media albums (media_group_id) into a single logical message
export const MEDIA_GROUP_HOLD_MS = 800;


export const ALL_UPDATES_9_2_SET = new Set<string>(ALL_UPDATES_9_2 as unknown as string[]);

export const MINIMAL_UPDATES_9_2_SET = new Set<string>(MINIMAL_UPDATES_9_2 as unknown as string[]);

export const isKnownUpdateName = (name: string): name is AllUpdate => {
  return ALL_UPDATES_9_2_SET.has(name);
};
