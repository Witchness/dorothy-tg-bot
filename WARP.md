# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Repository overview
- Language/tooling: TypeScript (ESM, Node >= 22), grammy (Telegram Bot API), vitest for tests.
- Package manager: pnpm (pnpm-lock.yaml and pnpm-workspace.yaml present).
- Entrypoint: src/index.ts. Build output to dist/.
- Runtime mode: polling only (webhook mode is not configured in this template).
- Persistent data directory: data/ is created on demand for registry snapshots, handled/unhandled samples, API error logs, and generated Markdown (data/entity-registry.md).

Setup
- Modes (independent):
  - TELEGRAM_MODE=polling|webhook — transport layer; keep polling locally
  - REGISTRY_MODE=debug|dev|prod — visual behavior of keyboards/alerts
  - PERSIST=on|off — enable DB+files persistence; requires ADMIN_CHAT_ID when on
- Persistence: messages stored under data/messages/{userId}/{messageId}/ with messages.json and downloaded files.
- Schema requests queue: use the inline button "🗒 Зберегти всі в JSON" to append requests into data/schema-requests.jsonl (override via SCHEMA_REQUESTS_PATH).
- Copy .env.example to .env and set at least BOT_TOKEN.
- Optional env keys: MODE (polling|webhook; only polling works here), LOG_LEVEL, ALLOWLIST_USER_IDS (comma-separated numeric Telegram user IDs), ADMIN_CHAT_ID for admin notifications.
- Update delivery: ALLOWED_UPDATES (all|minimal|custom). With custom, set ALLOWED_UPDATES_LIST (comma-separated names). Inline queries are disabled unless enabled here.
- Node.js 22+ is required by the engines field.

Install and run
- Install dependencies:
  pnpm install
- Start dev (TS with instant reload):
  pnpm dev
- Build TypeScript to dist/:
  pnpm build
- Run compiled build:
  pnpm start

Testing (vitest)
- Run the full test suite (non-watch):
  pnpm test
- Watch mode (interactive):
  pnpm exec vitest
- Run a single test file:
  pnpm exec vitest run tests/utils/text_utils.test.ts
- Run tests by name pattern (PowerShell quoting example):
  pnpm exec vitest -t "payload merge"

Key runtime behaviors and files
- Bot starts in polling mode and registers handlers for multiple Telegram update scopes. Allowed updates are derived from env; webhook mode is intentionally not wired in this template.
- Registry Markdown snapshot is written to data/entity-registry.md. Various JSON samples/logs are persisted under data/ as you interact with the bot (handled, handled-changes, unhandled, api-errors).
- Most administration happens via chat commands and inline keyboards: /registry, /registry_refresh, /registry_seed, /registry_reset, /reg_mode, /reg_scope, /reg_set, /present, /present_quotes, /env_missing.

High-level architecture (big picture)
- src/index.ts — central application wire‑up:
  - Configures grammy Bot, session, global API middleware, and top-level command/handler routes.
  - Orchestrates subsystems: Status Registry, Analyzer, Renderer, Unhandled Logger, Presenter.
  - Buffers media groups (albums) in-memory and flushes after MEDIA_GROUP_HOLD_MS.
  - Generates and refreshes the registry Markdown snapshot asynchronously.
- Status Registry subsystem:
  - registry_status.ts — in-memory model of scopes, message keys, and entity types with statuses (process|ignore|needs-review); supports snapshot/save.
  - registry_config.ts — persistent config and mode (debug|dev|prod); setStatus/setNote and storage policy for handled-changes.
  - registry_actions.ts — builds inline keyboards and parses callbacks to change statuses or add notes directly from chat.
  - registry_notifier.ts — debounced, chat-threaded diff notifications for newly observed scopes/keys/types.
  - report.ts — renders the current registry snapshot to Markdown (data/entity-registry.md).
- Message analysis and presentation:
  - analyzer.ts — inspects messages/media groups and emits structured analysis plus alerts for new payload shapes/keys.
  - renderer.ts — renders message/media content to HTML for rich "presentation" replies; quote style configured via PRESENT_QUOTES.
  - presenter_replay.ts — replays media back to chat (single items or bulk for albums) via inline buttons with TTL.
  - media_group_buffer.ts — buffers and flushes media_group_id updates (album handling) using MEDIA_GROUP_HOLD_MS.
- Observability and logging:
  - entity_registry.ts — records observed API shapes and update/payload/inline query keys.
  - unhandled_logger.ts — persists API samples, unhandled payload snapshots, and API errors under data/.
  - humanize.ts and text_utils.ts — key descriptions, safe Unicode, and Telegram-safe chunking of long messages.
- Access control:
  - allowlist_gate.ts — early allowlist check by user ID; drops untrusted updates before instrumentation.
- Constants and seeds:
  - constants.ts — ALLOWED_UPDATES sets and MEDIA_GROUP_HOLD_MS.
  - seed_catalog.ts — known scopes/keys/entity types for /registry_seed.

Local development notes
- The bot exits if BOT_TOKEN is missing. Keep MODE=polling for local runs. Webhooks are intentionally not wired.
- Some admin notifications target ADMIN_CHAT_ID; these are best-effort and non-fatal.
- Present mode and quote style are session-driven; toggle via /present and /present_quotes.

Handlers & composition
- Handlers live under src/handlers/ and encapsulate all runtime logic. index.ts wires them in a specific order and remains thin.
- Modules:
  - handlers/albums.ts — buffers media_group parts and flushes once; DI for timers, replySafe, registry, presenter registrars.
  - handlers/present_callbacks.ts — handles inline callbacks present|<id> and presentall|<bulkId>; enforces user authorization and TTL cleanup.
  - handlers/registry_callbacks.ts — handles reg|... actions for scope/key/type statuses and notes; updates registry and refreshes inline keyboards.
  - handlers/edited.ts — summarizes edited_message events, observes keys/types, posts diffs, refreshes Markdown.
  - handlers/channel.ts — summarizes channel_post and edited_channel_post events with per-scope keyboards.
  - handlers/business.ts — summarizes business_message and edited_business_message events with per-scope keyboards.
- Composition notes:
  - Keep middleware order unchanged to preserve behavior. Inline callback handlers should be registered before generic callback_query listeners.
  - Registry Markdown snapshot is refreshed in response to relevant updates (debounced) and on explicit commands.
- Testing:
  - Unit tests exist for handlers (albums, present_callbacks, registry_callbacks) and registry/presenter subsystems. Add more tests alongside new handlers as needed.
