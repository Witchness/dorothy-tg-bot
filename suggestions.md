# Dorothy Bot — Suggestions & Ideas

## Active Suggestions

1. **Add targeted regression tests**
   - Unit tests for persistence (mock FS, in-memory SQLite)
   - Tests for codepoint-safe chunker, media-group buffer flush
   - Allowlist gating order tests
   - E2E: text/photo/animation with reactions & DB verification
   
2. **Rate-limit registry notifications**
   - Batch markdown refreshes when many updates land together
   - Avoid spamming admin with near-duplicate diffs
   - _Touched files_: src/index.ts (registry alert pipeline)
   
3. **Rate-limit bulk presenter sends**
   - Throttle `presentall` to stay within Telegram rate limits
   - Consider reusing `sendMediaGroup` with cached `file_id`s for albums
   - _Touched files_: src/index.ts (presenter helpers)

4. **File-only graceful mode**
   - If DB open fails → persist files/messages.json but still react
   - Send one-time warning DM to admin
   - Allows bot to continue working even if SQLite is unavailable

5. **Config centralization**
   - Create src/config.ts with typed getters
   - Validate env at startup (TELEGRAM_MODE, REGISTRY_MODE, PERSIST, ADMIN_CHAT_ID, etc.)
   - Prevent runtime errors from missing/invalid config

## Completed ✅

- ~~Support custom update allowlists~~ — Already implemented (ALLOWED_UPDATES=custom + ALLOWED_UPDATES_LIST)
- ~~Reactions reliability~~ — Fixed: works in all chat types with proper API parameters
- ~~File downloads with proper extensions~~ — Fixed: .pdf, .mp4, etc. based on mime_type
- ~~API new-keys with inline buttons~~ — Fixed: ✅/🚫/🟨 buttons for new keys
- ~~Debug sink deduplication~~ — Fixed: TTL map prevents duplicate forwards
