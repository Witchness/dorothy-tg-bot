export const MINIMAL_UPDATES_9_2 = [
  "message",
  "edited_message",
  "callback_query",
] as const;

export type MinimalUpdate = (typeof MINIMAL_UPDATES_9_2)[number];
