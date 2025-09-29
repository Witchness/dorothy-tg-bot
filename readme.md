# Telegram Bot — Local Assistant (Node 22 + grammY)

This bot runs locally, helps you explore Telegram updates safely, and lets you interactively decide what to process. It “sees everything” but only “processes” what you explicitly allow — per scope and per key/entity type.

---

## TL;DR

- Target Bot API: **9.2** (bump after each Telegram release)
- Runtime: **Node.js 22 LTS**, TypeScript 5.7+, grammY 1.x
- Mode: **Polling** (simple local run)
- Access control: `ALLOWLIST_USER_IDS`
- Allowed updates: `ALLOWED_UPDATES=minimal|all|custom` (`minimal` by default; use `all` for everything or `custom` together with `ALLOWED_UPDATES_LIST`)
- Interactive registry (JSON “DB”):
  - Live status: `data/registry-status.json`
  - Overlay config (hot‑reload): `data/registry-config.json`
  - Human report (auto/force): `data/entity-registry.md`
- Debug/dev gating: ask to allow/ignore per scope/key/type when first seen
- Presentation mode: reconstructs text/caption with formatting, summarizes media, adds insights, and offers buttons to resend original files
- Media albums: aggregates `media_group_id` into a single logical reply (hold 800ms by default)
- Prod: silent — no debug/gating messages

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
   # Allowed updates for polling: minimal | all (use 'all' to receive inline queries)
   ALLOWED_UPDATES=minimal
  ALLOWED_UPDATES_LIST=message,edited_message,callback_query
   # Presentation defaults
   PRESENT_DEFAULT=off          # on|off — per-session can be toggled with /present
   PRESENT_QUOTES=prefix        # html|prefix — quote style in presenter
   # Handled-changes retention (see /snapshots): off | last-3 | all
   SNAPSHOT_HANDLED_CHANGES=all
   # Snapshot signature/sanitization sensitivity (dev-friendly defaults)
   SNAPSHOT_SIGN_DEPTH=4
   SNAPSHOT_SIGN_MAX_KEYS=40
   SNAPSHOT_SIGN_MAX_ITEMS=10
   SNAPSHOT_SAN_MAX_DEPTH=2
   SNAPSHOT_SAN_MAX_KEYS=15
   SNAPSHOT_SAN_MAX_ITEMS=5
   SNAPSHOT_SAN_MAX_STRING=200
   ```

3. Install dependencies: `npm install` (or `pnpm install`).
4. Start the dev server: `npm run dev` (or `pnpm dev`).
5. Stop with `Ctrl+C`.

> ⚠️ Node/npm are not bundled with the repository. Install them locally before launching the bot.

---

## What the bot does

- Message analysis (when enabled for the message scope/keys):
  - counts characters/words/lines, extracts commands, URLs, hashtags, emails, phone numbers
  - describes attachments (photo/video/voice/document/animation/audio/location/venue/etc.)
  - small text insights and link hints
- Interactive gating, per update:
  - Shows only the current update’s scope and present keys/entity types
  - Buttons: `✅ process`, `🚫 ignore`, `🟨 review`, `✏️ note`
  - If scope is ignored — no messages at all for that scope
- Registry awareness:
  - Tracks all observed scopes/keys/entity types (per‑scope) into `data/registry-status.json`
  - Hot overlay rules in `data/registry-config.json` (edited live, auto‑reloaded)
  - Report `data/entity-registry.md` (auto on changes and via `/registry_refresh`)
- Diagnostics buckets:
  - `data/handled/` snapshot, `data/handled-changes/` evolving shapes
  - `data/unhandled/` entirely new shapes
  - `data/api-errors/` deduped Bot API failures

### Presentation mode

- Reconstructs text/captions preserving formatting (HTML) with a robust fallback to plain text.
- Aggregates media albums into one presentation; lists photos/videos/documents with dimensions and sizes.
- Adds insights (links/hashtags/mentions) and meta (forward/reply/thread).
- Inline buttons to resend original files (per item) and a bulk “send all” for albums.
- Quote style is configurable: `/present_quotes html` (<blockquote>) or `/present_quotes prefix` (`>` prefixes).
- Link previews are disabled globally to keep replies compact.

---

## Project layout

```
tg-bot/
├─ src/
│  ├─ index.ts           # запуск, allowlist, історія, обробники
│  ├─ analyzer.ts        # логіка аналізу повідомлень
│  ├─ constants.ts         # MINIMAL_UPDATES_9_2 + ALL_UPDATES_9_2
│  ├─ entity_registry.ts   # legacy capture helpers (kept for compatibility)
│  ├─ registry_status.ts   # JSON “DB” per‑scope statuses + counters
│  ├─ registry_config.ts   # overlay config (mode + statuses + notes), hot‑reloaded
│  ├─ registry_actions.ts  # inline keyboards + callbacks (status/note)
│  ├─ report.ts            # builds data/entity-registry.md
│  ├─ humanize.ts          # human‑friendly samples for keys
│  └─ unhandled_logger.ts  # sanitized samples + API error logging
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

## Snapshot folders

- `data/handled/` – generated registry snapshot (`registry.json` + `registry.md`) plus historical payload samples saved as `label__<signature>.json` once a structure is considered covered.
- `data/handled-changes/` – new variants for already known payloads (same `label__<signature>.json` naming) so we can review Bot API evolutions without regressing analysis.
- `data/unhandled/` – first-time payloads/update types that are completely unknown; each unique shape gets its own `label__<signature>.json` file.
- `data/api-errors/` – deduplicated Bot API failures (grouped by method + error description/payload) to track regressions such as 400 UTF-8 issues.

---

## `.env` configuration

- `BOT_TOKEN` — token issued by @BotFather.
- `MODE` — `polling` (webhooks are optional and not configured here)
- `LOG_LEVEL` — `debug`, `info`, `warn`, or `error` (`info` by default).
- `ALLOWLIST_USER_IDS` — list of user IDs allowed to receive replies. Leave empty for dev/testing sessions.
- `ADMIN_CHAT_ID` — optional chat ID that receives registry alerts (`/start` the bot from your personal chat to get the numeric ID).
- `ALLOWED_UPDATES` — `minimal`, `all`, or `custom` (default `minimal`). Use `all` to receive everything or `custom` with `ALLOWED_UPDATES_LIST` for a trimmed set.
- `PRESENT_DEFAULT` — `on|off` (default `off`): presenter replies per session; can be toggled via `/present`.
- `PRESENT_QUOTES` — `html|prefix` (default `prefix`): quote style in presenter.
- `SNAPSHOT_HANDLED_CHANGES` — `off|last-3|all` (default `all`): retention for `data/handled-changes`.
- `SNAPSHOT_SIGN_*`, `SNAPSHOT_SAN_*` — tune signature and sanitization limits (see `.env.example`).

Add your own variables (third-party API keys, feature flags, etc.); everything is loaded through `dotenv`.

---

## Behaviour and commands

Modes (set in `data/registry-config.json` or `/reg_mode`):
- `debug`: always show an event summary with scope + present keys/types and inline controls
- `dev` (default): show only when new/unknown items appear; still interactive
- `prod`: silent — no debug/gating messages; only your real handlers run for enabled scopes/keys

Core commands:
- `/reg_mode <debug|dev|prod>` — switch modes (hot reload)
- `/reg_scope <scope>` — manage statuses/notes for a specific scope via inline buttons
- `/reg_set <scope|key|type> <name> <process|ignore|needs-review>` — power set
- `/registry` — send the Markdown report
- `/registry_refresh` — force rebuild Markdown from current DB
- `/registry_seed [process|needs-review]` — prefill DB with typical scopes/keys/types
- `/registry_reset [hard] [wipe]` — reset DB; `hard` also resets config; `wipe` removes logs/snapshots
- `/reg` and `/help` — quick help
- `/history` — last five analysis replies (only for enabled message text/caption)
 - `/present <on|off>` — toggle presentation mode for current session (HTML/text reconstruction + buttons)
 - `/present_quotes <html|prefix>` — switch quote rendering style in presenter
 - `/snapshots <off|last-3|all>` — set handled-changes retention policy (also overridable via env)
 - `/env_missing` — list absent env variables with suggested defaults

Typical onboarding:
1) `/registry_reset hard wipe` — clean start
2) `/reg_mode debug` — always show per‑message controls
3) Send a message — approve `scope: message`, then approve `key: message.text` (or `caption`)
4) Continue approving only what you need; switch to `dev` or `prod` when done

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
 - **HTML parse errors (can't parse entities)** — presenter falls back to plain text automatically; see logs `[present] single/album ...`.
 - **Inline queries not received** — set `ALLOWED_UPDATES=all` or include `inline_query` in `ALLOWED_UPDATES_LIST` when `ALLOWED_UPDATES=custom`.

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

