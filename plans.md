# Project plan — Refactor and Hardening Roadmap (dorothy-tg-bot)

This plan tracks the roadmap. Sections: Done / Next / Backlog. Keep it short and actionable.

Done (2025-09-30)
- ✅ **Reactions** — відправляються успішно в private/group/supergroup (❤️/👎), `is_big: false`
- ✅ **Persistence** — всі повідомлення зберігаються в SQLite + JSON + attachments
- ✅ **File downloads** — виправлено URL (bot prefix), розширення файлів (.pdf, .mp4 тощо)
- ✅ **API new-keys buttons** — inline кнопки (✅/🚫/🟨) для нових API ключів
- ✅ **Prod behavior** — пересилання + аналіз + кнопки адміну в REGISTRY_MODE=prod
- ✅ **Debug sink deduplication** — TTL map для forwardedOnce, немає дублікатів
- ✅ **CRITICAL logging** — детальні логи на кожному кроці persistence
- ✅ **Docs updated** — README, AGENTS, CHANGELOG оновлено

Next
- Admin-only commands guard
  - Ensure middleware blocks commands outside ADMIN_CHAT_ID. Add test.
- Config centralization
  - Create src/config.ts with typed getters: TELEGRAM_MODE, REGISTRY_MODE, PERSIST, ADMIN_CHAT_ID, DB path, DATA dir; validate at startup.
- Tests for persistence
  - Unit tests: mock FS, in-memory SQLite
  - E2E: text/photo/animation with reactions & DB verification

Backlog (later/optional)
- Extract callback_query: nested payload navigation buttons (if additional UI grows) into a small helper.
- Status notifier/refactor: move registryNotifier creation/wiring to its own module.
- Add higher-level integration tests that simulate a few end‑to‑end flows with Bot stubs.
- Minor quality improvements:
  - Small helpers for update key normalization.
  - Centralize admin notifications and message formatting in a utility.
  - Consider simple lint/format task and pre-commit hooks (optional).

Rationale (our idea, summarized)
- Keep behavior 1:1 while making the codebase maintainable:
  - Thin index.ts → composition only.
  - Logic in small testable units: commands/ and handlers/ per responsibility.
  - Shared utils for side effects (FS, messaging) and consistent behavior.
- Testing-first refactor: extract → wire → add tests → keep green. Prefer DI for stability and fewer global side effects.
- Windows-aware tests: mock atomic writes in unit tests that hit data/ to avoid EPERM and flakiness; real app remains safe.
- Coverage with intent: target risky paths (formatting, album flush timing, callback auth/expiry) rather than chasing 100% blindly, excluding index.ts from requirements.

Backlog
- Schema-requests tooling (CLI): import/export data/schema-requests.jsonl <-> DB schema_requests (dry-run, dedup)
- Download pipeline polish: retries with backoff; header/size validation; temp cleanup on error
- DB care: WAL/PRAGMA tuning; scheduled checkpoint; optional VACUUM task
- Observability: structured logs (op tags), lightweight metrics (saved/failed/attachments)
- CI: add windows-latest to matrix
- Tests: album edge cases (mixed types, late parts, cancellation), path normalization with Unicode/special filenames
- Security/Privacy: extensible sanitizer for stored JSON and retention knobs
- Tooling: pre-commit hooks (format/lint), typed DB layer + migrations
- Viewer: small utility to browse schema-requests.jsonl
- Rotation: log rotation for admin failures and api-errors
- Docker (later): minimal Node base with prebuilt native modules; data/ volume
- Performance: album buffering memory, streaming write for large files
- Event bus: decouple "new keys" hooks from handlers
- Present mode: configurable defaults per chat/user
- Health: /health or self-check command
- Telemetry toggles for noisy areas
