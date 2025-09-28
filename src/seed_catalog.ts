export type SeedStatus = "process" | "needs-review";

export const SEED_SCOPES: string[] = [
  "message",
  "edited_message",
  "callback_query",
  "inline_query",
  "channel_post",
  "edited_channel_post",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
];

export const SEED_MESSAGE_KEYS: Record<string, string[]> = {
  message: [
    "message_id",
    "date",
    "chat",
    "from",
    "via_bot",
    "business_connection_id",
    "has_protected_content",
    "reply_to_message",
    "forward_origin",
    "link_preview_options",
    "entities",
    "caption_entities",
    "text",
    "caption",
    "photo",
    "sticker",
    "video",
    "video_note",
    "voice",
    "animation",
    "document",
    "audio",
    "contact",
    "location",
    "venue",
    "poll",
    "dice",
    "game",
    "paid_star_count",
  ],
  edited_message: [
    "message_id",
    "date",
    "edit_date",
    "chat",
    "from",
    "entities",
    "caption_entities",
    "text",
    "caption",
    "photo",
    "sticker",
    "video",
    "video_note",
    "voice",
    "animation",
    "document",
    "audio",
    "contact",
    "location",
    "venue",
    "poll",
  ],
};

export const SEED_ENTITY_TYPES: Record<string, string[]> = {
  message: [
    "mention",
    "hashtag",
    "cashtag",
    "bot_command",
    "url",
    "email",
    "phone_number",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "spoiler",
    "code",
    "pre",
    "text_link",
    "text_mention",
    "custom_emoji",
    "blockquote",
    "expandable_blockquote",
  ],
  edited_message: [
    "mention",
    "hashtag",
    "bot_command",
    "url",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "spoiler",
    "code",
    "pre",
  ],
};

export function buildSeedSamples(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    switch (k) {
      case "text": out[k] = '"Sample text"'; break;
      case "caption": out[k] = '"Sample caption"'; break;
      case "photo": out[k] = "Photo: x1, max=800x600"; break;
      case "sticker": out[k] = "Sticker: type=regular"; break;
      case "video": out[k] = "Video: 1280x720, 10s"; break;
      case "video_note": out[k] = "Video Note: 240x240, 6s"; break;
      case "voice": out[k] = "Voice: 5s"; break;
      case "animation": out[k] = "Animation: 640x640, 3s"; break;
      case "document": out[k] = "Document: 1.2 MB, doc.pdf, application/pdf"; break;
      case "audio": out[k] = "Audio: 180s, Artist — Title"; break;
      case "contact": out[k] = "Contact: John Doe, phone=+12****34"; break;
      case "location": out[k] = "Location: 50.45, 30.52"; break;
      case "venue": out[k] = "Venue: Cafe, Address"; break;
      case "poll": out[k] = "Poll: question=\"Which?\", options=3, anonymous"; break;
      case "dice": out[k] = "Dice: 🎲 5"; break;
      case "game": out[k] = "Game: Chess"; break;
      default: out[k] = ""; break;
    }
  }
  return out;
}

