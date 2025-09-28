# Entity Registry

Оновлено: 2025-09-28T20:47:54.358Z

Всього: 47 keys, 17 entity types

## Scopes (update.*)
- Обробляємо: `message`
- Не обробляємо: `edited_message`

### Примітки до scopes
- edited_message: Treat edits as new; configure as needed
- message: /cancel

## Message keys (by scope)
### callback_query
- Потребує огляду: `chat_instance`, `data`, `from`, `id`, `message`
- Примітки:
  - chat_instance: лише у: callback_query
  - data: лише у: callback_query
  - from: скоупи: callback_query, edited_message, message
  - id: лише у: callback_query
  - message: лише у: callback_query
### edited_message
- Не обробляємо: `chat`, `checklist`, `date`, `edit_date`, `from`, `message_id`
- Потребує огляду: `location`
- Примітки:
  - chat: скоупи: edited_message, message
  - checklist: скоупи: edited_message, message
  - date: скоупи: edited_message, message
  - edit_date: лише у: edited_message
  - from: скоупи: callback_query, edited_message, message
  - message_id: скоупи: edited_message, message
  - location: скоупи: edited_message, message
### message
- Обробляємо: `всі дозволені`, `animation`, `audio`, `caption`, `caption_entities`, `chat`, `contact`, `date`, `document`, `entities`, `forward_date`, `forward_from`, `forward_from_chat`, `forward_from_message_id`, `forward_origin`, `forward_signature`, `from`, `link_preview_options`, `location`, `media_group_id`, `message_id`, `photo`, `reply_markup`, `reply_to_message`, `show_caption_above_media`, `sticker`, `text`, `video`, `video_note`, `voice`
- Не обробляємо: `checklist`, `checklist_tasks_done`, `pinned_message`, `poll`, `venue`
- Примітки:
  - animation: лише у: message
  - caption: лише у: message
  - caption_entities: лише у: message
  - chat: скоупи: edited_message, message
  - checklist: скоупи: edited_message, message
  - checklist_tasks_done: лише у: message
  - date: скоупи: edited_message, message
  - document: лише у: message
  - entities: лише у: message
  - forward_date: лише у: message
  - forward_from: лише у: message
  - forward_from_chat: лише у: message
  - forward_from_message_id: лише у: message
  - forward_origin: лише у: message
  - forward_signature: лише у: message
  - from: скоупи: callback_query, edited_message, message
  - link_preview_options: лише у: message
  - location: скоупи: edited_message, message
  - media_group_id: лише у: message
  - message_id: скоупи: edited_message, message
  - photo: лише у: message
  - pinned_message: лише у: message
  - poll: лише у: message
  - reply_markup: лише у: message
  - reply_to_message: лише у: message
  - show_caption_above_media: лише у: message
  - sticker: лише у: message
  - text: лише у: message
  - video: лише у: message
  - video_note: лише у: message
  - voice: лише у: message
  - contact: лише у: message
  - audio: лише у: message
  - venue: лише у: message

## Entity types (by scope)
### message
- Обробляємо: `blockquote`, `bold`, `bot_command`, `cashtag`, `code`, `custom_emoji`, `email`, `hashtag`, `italic`, `mention`, `phone_number`, `pre`, `spoiler`, `strikethrough`, `text_link`, `underline`, `url`
- Примітки:
  - bold: лише у: message
  - bot_command: лише у: message
  - custom_emoji: лише у: message
  - phone_number: лише у: message
  - text_link: лише у: message
  - url: лише у: message
  - hashtag: лише у: message
  - spoiler: лише у: message
  - italic: лише у: message
  - blockquote: лише у: message
  - underline: лише у: message
  - strikethrough: лише у: message
  - pre: лише у: message
  - mention: лише у: message
  - cashtag: лише у: message
  - email: лише у: message
  - code: лише у: message
> Підказка: /registry відправить цей звіт у чат.
