# Project plan — Refactor and Hardening Roadmap (dorothy-tg-bot)

This plan tracks the ongoing refactor to make the bot’s entrypoint thin, logic modular and testable, and behavior consistent. Sections: Done / Next / Backlog.

Done
- Test coverage uplift (renderer/analyzer/unhandled_logger)
  - Renderer: lines ≈96%, branches ≈79% (added nested-entities, boundaries, escaping, media attachments cases).
  - Analyzer: lines ≈94%, branches ≈69% (language detection and summary edges, link-insights fallback, entities).
  - Unhandled logger: lines ≈94%, branches ≈80% (sanitization/signature limits across depths; error parsing path).
  - Coverage reports now go to tests/coverage and auto-open post-test.
- WARP.md created with focused commands and architecture overview.
- Utilities consolidated
  - src/utils/safe_fs.ts: ensureDirFor, writeFileAtomic; index.ts switched to use them.
  - src/utils/safe_messaging.ts: central replySafe/sendSafeMessage; index.ts now uses adapters instead of ad‑hoc logic.
- Command modules extracted and wired
  - src/commands/registry.ts → /registry, /registry_refresh, /registry_seed, /registry_reset
  - src/commands/reg.ts → /reg, /reg_mode, /reg_scope
  - Unit tests added for both modules.
- Handlers extracted and wired
  - src/handlers/albums.ts — media_group buffering + flush factory; unit test with fake timers.
  - src/handlers/edited.ts — edited_message
  - src/handlers/channel.ts — channel_post, edited_channel_post
  - src/handlers/business.ts — business_message, edited_business_message

Next (detailed)
1) Extract callback_query handlers (split by responsibility)
   1.1) Present/replay callbacks → src/handlers/present_callbacks.ts
   - Move handling for present|<id> and presentall|<bulkId>.
   - Inject dependencies: presentActions/presentBulkActions maps, TTL, replayPresentPayloads, and authorization guard (user id must match creator).
   - Preserve existing behavior (answerCallbackQuery on success/failure, timer cleanup upon use/expiry).
   - Unit tests:
     - valid present single, valid presentall bulk (order kept, delays via DEFAULT_PRESENTALL_DELAY_MS).
     - expired/unknown id → show_alert, no send.
     - unauthorized (different user) → show_alert, no send.
     - TTL auto-expiry clears entries.
   1.2) Registry status callbacks → src/handlers/registry_callbacks.ts
   - Move handling for reg|… actions (scope/key/type + status or note).
   - Inject: parseRegCallback, setStatus/setNote, statusRegistry instance, and keyboard rebuild helper.
   - Preserve behavior: update statuses, cascade ignore on scope, edit keyboard to hide resolved items, fallback to needs-review items when parsing insufficient.
   - Unit tests:
     - set status for scope/key/type, note flow, cascade ignore.
     - keyboard update (editMessageReplyMarkup) and fallback logic for needs‑review.

2) Make index.ts purely compositional
   - Keep only: config/env parsing, adapters wiring, imports, registry/status initialization, and a concise main().
   - No logic branching in index.ts — everything lives in commands/handlers.
   - Document the composition order and injected dependencies inline (short comments).

3) Light DI (dependency injection) for handlers
   - For all handlers, accept their side‑effects as parameters (fs writer, reply adapter, logger, timers) to simplify unit testing and avoid direct imports in tests.
   - Document the DI shape in a small README note in handlers/ (optional).

4) Tests — expand and stabilize
   - Callback handler tests (present, presentall, reg|…).
   - Integration smoke: minimal Bot stub that registers all commands/handlers; assert a subset of routes exist and do not throw with mock contexts.
   - Windows‑friendly FS: continue mocking writeFileAtomic in tests that touch data/ to avoid EPERM.

5) Coverage targets and guardrails
   - renderer branches ≥85%, analyzer branches ≥75%; command/handler lines ≥85%.
   - Optionally exclude index.ts from coverage (entrypoint-only composition). Keep as optional to avoid forcing.

6) Docs refresh (short and specific)
   - Update WARP.md to reflect new module layout (commands/, handlers/, utils/).
   - Keep WARP.md concise — only non-obvious big-picture and exact dev commands.

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

How to continue (actionable checklist)
- [ ] Implement src/handlers/present_callbacks.ts + tests
- [ ] Implement src/handlers/registry_callbacks.ts + tests
- [ ] Slim index.ts composition (remove any lingering logic)
- [ ] Update WARP.md “Architecture” section with new modules
- [ ] Re-run full test suite and review coverage thresholds
- [ ] Decide whether to exclude index.ts from coverage or keep as is
