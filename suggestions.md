# Code Review Suggestions

## Backlog
1. **Support custom update allowlists.** Add an `ALLOWED_UPDATES=custom` mode that reads `ALLOWED_UPDATES_LIST` (e.g. `message,edited_message,callback_query,inline_query`) so polling/webhooks can be trimmed for specific deployments. _Touched files_: src/index.ts, src/constants.ts.
2. **Add targeted regression tests.** Introduce focused tests for the codepoint-safe chunker, media-group buffer flush, allowlist gating order, and merged array snapshot logic, and hook them up to `pnpm test`.
3. **Rate-limit registry notifications.** When many updates land together, batch markdown refreshes and chat notices so we avoid spamming operators with near-duplicate diffs. _Touched files_: src/index.ts (registry alert pipeline).
4. **Rate-limit bulk presenter sends.** Throttle `presentall` (or reuse `sendMediaGroup` with cached `file_id`s) to stay within Telegram’s rate limits when replaying large albums. _Touched files_: src/index.ts (presenter helpers).
