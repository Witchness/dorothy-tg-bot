# Entity Registry

Оновлено: 2025-09-28T17:13:47.448Z

Всього: 42 keys, 20 entity types

## Scopes (update.*)
- Обробляємо: `callback_query`, `inline_query`, `message`
- Потребує огляду: `edited_message`

## Message keys (by scope)
### edited_message
- Не обробляємо: `edit_date`
- Потребує огляду: `caption`, `chat`, `checklist`, `date`, `entities`, `from`, `message_id`, `text`, `voice`
- Примітки:
  - chat: скоупи: edited_message, message
  - date: скоупи: edited_message, message
  - edit_date: скоупи: edited_message, message
  - entities: скоупи: edited_message, message
  - from: скоупи: edited_message, message
  - message_id: скоупи: edited_message, message
  - text: скоупи: edited_message, message
  - voice: скоупи: edited_message, message
  - caption: скоупи: edited_message, message
  - checklist: скоупи: edited_message, message
### message
- Обробляємо: `animation`, `audio`, `business_connection_id`, `caption`, `caption_entities`, `chat`, `date`, `document`, `entities`, `forward_origin`, `from`, `has_protected_content`, `link_preview_options`, `message_id`, `paid_media`, `paid_star_count`, `photo`, `quoted_message`, `reply_to_message`, `sticker`, `text`, `via_bot`, `video`, `voice`
- Не обробляємо: `edit_date`
- Потребує огляду: `checklist`, `checklist_tasks_done`, `forward_date`, `forward_from`, `location`, `poll`, `video_note`
- Примітки:
  - animation: лише у: message
  - caption: скоупи: edited_message, message
  - chat: скоупи: edited_message, message
  - date: скоупи: edited_message, message
  - document: лише у: message
  - edit_date: скоупи: edited_message, message
  - entities: скоупи: edited_message, message
  - forward_origin: лише у: message
  - from: скоупи: edited_message, message
  - message_id: скоупи: edited_message, message
  - photo: лише у: message
  - reply_to_message: лише у: message
  - sticker: лише у: message
  - text: скоупи: edited_message, message
  - voice: скоупи: edited_message, message
  - video_note: лише у: message
  - location: лише у: message
  - checklist: скоупи: edited_message, message
  - checklist_tasks_done: лише у: message
  - poll: лише у: message
  - forward_from: лише у: message
  - forward_date: лише у: message

## Entity types (by scope)
### edited_message
- Потребує огляду: `bot_command`
- Примітки:
  - bot_command: скоупи: edited_message, message
### message
- Обробляємо: `blockquote`, `bold`, `bot_command`, `cashtag`, `code`, `custom_emoji`, `email`, `expandable_blockquote`, `hashtag`, `italic`, `mention`, `phone_number`, `pre`, `spoiler`, `strikethrough`, `text_link`, `text_mention`, `underline`, `url`
- Примітки:
  - bot_command: скоупи: edited_message, message
> Підказка: /registry відправить цей звіт у чат.
