# Entity Registry

Оновлено: 2025-09-28T19:47:07.908Z

Всього: 33 keys, 2 entity types

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
- Примітки:
  - chat: скоупи: edited_message, message
  - checklist: скоупи: edited_message, message
  - date: скоупи: edited_message, message
  - edit_date: лише у: edited_message
  - from: скоупи: callback_query, edited_message, message
  - message_id: скоупи: edited_message, message
### message
- Обробляємо: `animation`, `caption`, `chat`, `date`, `document`, `entities`, `forward_date`, `forward_from`, `forward_origin`, `from`, `location`, `media_group_id`, `message_id`, `photo`, `reply_to_message`, `sticker`, `text`
- Не обробляємо: `checklist`, `checklist_tasks_done`, `pinned_message`, `poll`
- Потребує огляду: `reply_markup`
- Примітки:
  - animation: лише у: message
  - chat: скоупи: edited_message, message
  - checklist: скоупи: edited_message, message
  - checklist_tasks_done: лише у: message
  - date: скоупи: edited_message, message
  - document: лише у: message
  - entities: лише у: message
  - forward_date: лише у: message
  - forward_from: лише у: message
  - forward_origin: лише у: message
  - from: скоупи: callback_query, edited_message, message
  - location: лише у: message
  - message_id: скоупи: edited_message, message
  - pinned_message: лише у: message
  - reply_markup: лише у: message
  - reply_to_message: лише у: message
  - sticker: лише у: message
  - text: лише у: message
  - poll: лише у: message
  - caption: лише у: message
  - photo: лише у: message
  - media_group_id: лише у: message

## Entity types (by scope)
### message
- Обробляємо: `phone_number`
- Потребує огляду: `bot_command`
- Примітки:
  - bot_command: лише у: message
  - phone_number: лише у: message
> Підказка: /registry відправить цей звіт у чат.
