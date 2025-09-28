# Telegram Bot — Local Assistant (Node 22 + grammY)

This bot targets a tiny private team: you and a teammate talk to the bot in a direct chat and it replies with as much metadata as possible about each message. It runs locally on an older PC using polling; no channels, business features, or complex infrastructure are required.

---

## TL;DR

- Target Bot API: **9.2** (bump after every Telegram release)
- Runtime: **Node.js 22 LTS**, TypeScript 5.7+, grammY 1.x
- Mode: **Polling** — the simplest option for a local PC
- Access control: `ALLOWLIST_USER_IDS` keeps the bot private
- Minimal `allowed_updates`: `MINIMAL_UPDATES_9_2`
- Self-updating registry: `data/entity-registry.json`, handled snapshot in `data/handled/`, fresh samples in `data/unhandled/`, API failures in `data/api-errors/`
- Automatic admin alerts when new Bot API fields appear (`ADMIN_CHAT_ID`)
- `/history` command prints the latest 5 bot responses

---

## Quick Start (Windows)

1. Install Node.js 22 LTS.
2. Copy `.env.example` → `.env` and fill it in:

   ```ini
   BOT_TOKEN=123456:ABC...
   MODE=polling
   LOG_LEVEL=info
   # Comma separated user IDs allowed to talk to the bot
   ALLOWLIST_USER_IDS=111111111,222222222
   # Optional: chat ID for registry alerts (e.g. your personal chat)
   ADMIN_CHAT_ID=111111111
   ```

3. Install dependencies: `npm install` (or `pnpm install`).
4. Start the dev server: `npm run dev` (or `pnpm dev`).
5. Stop with `Ctrl+C`.

> ⚠️ Node/npm are not bundled with the repository. Install them locally before launching the bot.

---

## What the bot does

- **Message analysis**: counts characters/words/lines, extracts commands, URLs, hashtags, emails, phone numbers, and describes attachments (photo, video, document, voice, location, etc.).
- **Smart insights**: lightweight summary of the text, language guess (Latin vs Cyrillic heuristics), and link intelligence (host + path hints).
- **Metadata capture**: forwards, replies, threads, reactions, business fields, paid media.
- **Conversation history**: stores the latest 10 analyses; `/history` prints the most recent five.
- **Bot API awareness**:
  - `data/entity-registry.json` lists every key observed across updates/messages/payloads/API responses.
  - `data/handled/` keeps a generated snapshot (`registry.json` + `registry.md`) of everything treated as "known".
  - `data/handled-changes/` stores sanitized samples for labels we already track but whose shape just evolved (same `label__<signature>.json` naming).
  - `data/api-errors/` captures sanitized API failures (deduped by description + payload).
  - `data/unhandled/*.json` is now only for truly unknown payloads/update types. Each file is stored per unique shape as `label__<signature>.json`.
- **Logs new keys automatically** with messages such as `[registry] New message keys: giveaway` or `[samples] Added samples for message: giveaway`.
- **Optional admin pings**: when `ADMIN_CHAT_ID` is present, the bot sends alerts about newly observed keys/entity types and API responses.

---

## Project layout

```
tg-bot/
├─ src/
│  ├─ index.ts           # запуск, allowlist, історія, обробники
│  ├─ analyzer.ts        # логіка аналізу повідомлень
│  ├─ constants.ts       # MINIMAL_UPDATES_9_2
│  ├─ entity_registry.ts # відстеження нових ключів та payload'ів
│  └─ unhandled_logger.ts# збереження прикладів сирих даних
├─ data/
│  ├─ entity-registry.json   # генерується автоматично
│  ├─ handled/               # snapshot of handled keys (JSON + Markdown)
│  ├─ handled-changes/       # samples for known-but-evolving payloads
│  ├─ api-errors/            # останні зафіксовані помилки API
│  └─ unhandled/             # приклади нових payload'ів (JSON)
├─ .env.example
├─ package.json
├─ tsconfig.json
└─ readme.md
```

---

## `.env` configuration

- `BOT_TOKEN` — token issued by @BotFather.
- `MODE` — `polling` (webhooks are optional and not configured here).
- `LOG_LEVEL` — `debug`, `info`, `warn`, or `error` (`info` by default).
- `ALLOWLIST_USER_IDS` — list of user IDs allowed to receive replies. Leave empty for dev/testing sessions.
- `ADMIN_CHAT_ID` — optional chat ID that receives registry alerts (`/start` the bot from your personal chat to get the numeric ID).

Add your own variables (third-party API keys, feature flags, etc.); everything is loaded through `dotenv`.

---

## Behaviour and commands

- `/history` — prints the latest five analyses with timestamps and preview lines.
- Any other message → the bot responds with structured analysis, for example:

  ```
  Повідомлення #3 у нашій розмові.
  📝 Текст: 124 символів, 18 слів, 3 рядки
  • Посилання: https://example.com
  📎 Вкладення:
  • Фото 1280×720 (1.2 МБ)
  ℹ️ Мета:
  • Переслано з чату Example
  ```

---

## npm scripts

| Script         | Description                              |
|----------------|------------------------------------------|
| `npm run dev`  | Dev mode with `tsx watch`
| `npm run build`| Compile TypeScript into `dist/`
| `npm start`    | Run the compiled app (after `build`)

---

## Troubleshooting checklist

- **429 Too Many Requests** — respect `retry_after`, slow down outgoing requests.
- **403 Bot was blocked** — do not retry; log and move on.
- **401 Unauthorized** — double-check `BOT_TOKEN`.
- **409 Conflict** — avoid running polling and webhook simultaneously.
- **New keys detected** — inspect `data/entity-registry.json` and `data/unhandled/` and extend handlers accordingly.

---

## Docker (optional)

```yaml
services:
  bot:
    image: node:22-alpine
    working_dir: /app
    volumes:
      - ./:/app
    command: sh -c "npm ci && npm run dev"
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - MODE=polling
      - LOG_LEVEL=info
      - ALLOWLIST_USER_IDS=${ALLOWLIST_USER_IDS}
    restart: unless-stopped
```

> Important: files inside `data/unhandled/` may contain PII. Enable sample logging only when you actively debug new payloads.

---

## Update policy & conventions

- Keep Bot API targets in sync with new releases: update `MINIMAL_UPDATES_*`, README, and comment in plans once a new version drops.
- Runtime stack: stay on Node 22 LTS until end-of-support (Oct 2025), TypeScript ≥ 5.7, grammY 1.x.
- Files under `data/` are local diagnostics and should not be committed by default.
- **House rule:** write comments and Markdown files in English only.

---

## License

MIT

