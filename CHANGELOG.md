# CHANGELOG — Dorothy Telegram Bot

## 2025-09-30 — Критичні виправлення persistence та реакцій

### ✅ Виправлення

1. **Реакції тепер працюють** (❤️ на успіх, 👎 на помилку)
   - Виправлено: `createSimpleReactions()` тепер приймає `bot.api` як параметр
   - Видалено хибну перевірку `chatType === "private"` (реакції працюють у всіх типах чатів)
   - Додано параметр `{ is_big: false }` згідно grammY API

2. **Збереження в БД тепер працює коректно**
   - Виправлено тип `is_bot`: boolean → number (0/1) для SQLite
   - Додано детальне логування на кожному кроці (upsert user/chat, insert message/attachments)
   - CRITICAL помилки тепер чітко видимі в консолі

3. **Завантаження файлів виправлено**
   - Виправлено URL: `https://api.telegram.org/file/bot{TOKEN}/{file_path}` (був відсутній префікс `bot`)
   - Документи тепер зберігаються з правильним розширенням (.pdf, .zip, .mp4 тощо)
   - Для animations (GIF) пропускається дублікат document
   - Детальне логування кожного кроку завантаження

4. **API нові ключі тепер з кнопками**
   - Повідомлення "New API response keys for X" тепер включає inline кнопки (✅ process / 🚫 ignore / 🟨 review)
   - Максимум 3 ключі одночасно для компактності

5. **Продакшн-поведінка оновлена**
   - В REGISTRY_MODE=prod: завжди пересилається оригінал + аналіз + деталі адміну
   - Inline кнопки показуються для керування статусами
   - Інтерактивні кнопки "додати ключі" тільки в debug режимі

### 📊 Поточний стан

- **Persistence**: Всі повідомлення (текст + attachments) зберігаються в SQLite БД + файли
- **Reactions**: ❤️ ставиться на успішне збереження
- **БД схема**: users, chats, messages (з повним JSON), attachments, events, errors, schema_requests
- **Файли**: Зберігаються в `data/messages/{userId}/{messageId}/` з правильними розширеннями

### 🧪 Тестування

- Створено `test-reactions.ts` для перевірки реакцій (всі 5 тестів пройдені успішно)
- Підтверджено роботу в приватних чатах

### 🔧 Технічні деталі

- Node.js 22+, TypeScript, grammY
- SQLite (better-sqlite3) з WAL режимом
- Atomic file writes (Windows-safe)
- Debug логування: `DEBUG=debug npm run dev`