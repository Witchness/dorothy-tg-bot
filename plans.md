# Project plan — Refactor and Hardening Roadmap (dorothy-tg-bot)

This plan tracks the ongoing refactor to make the bot’s entrypoint thin, logic modular and testable, and behavior consistent. Sections: Done / Next / Backlog.

Done
- JSON queue для schema-requests: кнопка "🗒 Зберегти всі в JSON" (rq|…) додає запис у data/schema-requests.jsonl; exp/expall НЕ змінюють БД
- Failure notifier (ADMIN_CHAT_ID): на помилках персистентності — forward/copy оригіналу + технічне повідомлення
- Prod guard: MODE=prod вимагає ADMIN_CHAT_ID і ставить registry_mode=prod
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
- Callback handlers extracted
  - src/handlers/present_callbacks.ts — present|… / presentall|…
  - src/handlers/registry_callbacks.ts — reg|… (statuses/notes)
  - src/handlers/expect_callbacks.ts — exp|… / expall|… (додавання очікуваних ключів)
- Slim index.ts composition; index.ts excluded from coverage (entrypoint-only)

Next (archived — see cleaned checklist below)
1) Prod mode: persistence & notifications (cross‑platform: Windows/Linux/Docker)
   - DB (SQLite, готова до еволюції схеми):
     - users(id, username, first_name, last_name, is_bot, seen_at)
     - chats(id, type, title, username, seen_at)
     - messages(id, chat_id, user_id, date, scope, has_text, text_len, json TEXT NOT NULL, files_dir TEXT, created_at)
     - attachments(id, message_id, kind, file_id, file_unique_id, file_name, mime, size, width, height, duration, path TEXT)
     - events(id, kind, payload JSON, created_at)
     - errors(id, message_id, code, description, details JSON, created_at)
     - schema_requests(id, label, keys JSON, requested_by, created_at) — запити “додати поле/очікування” від адміна
     - Примітка: повний Telegram message JSON зберігаємо у messages.json, нові ключі автоматично не ламають схему; індексні поля мінімальні.
     - Розташування БД: data/db/main.sqlite (директорія data/db; один файл БД за замовчуванням).
   - Storage policy:
     - Persist everything we read into DB (повний JSON у messages.json), окрім бінарних файлів.
     - Files: download → data/messages/{userId}/{messageId}/ → attachments.path зберігає відносний шлях.
   - Reactions (Telegram):
     - На успішне збереження → реакція 👌; на провал → ❌ (без тексту, просто реакція).
   - Error handling:
     - На ❌: відправити користувачу коротке повідомлення “Не вдалося зберегти повідомлення. Спробуйте пізніше.”
     - ДМ адмінам (ADMIN_CHAT_ID, особистий чат з ботом): переслати оригінал юзера, нашу відповідь і технічну помилку.
   - Admin notifications (prod, ДМ у ADMIN_CHAT_ID):
     - Нові ключі: як і зараз у dev (клавіатури під повідомленнями). Додатково: при натисканні кнопок exp/expall створюється запис у schema_requests (label/keys, requested_by). Без кнопок “Прочитано/Очікувати/Запланувати/Ігнорувати”.
   - Configuration:
     - MODE=prod; ранній allowlist‑gate активний.
     - ADMIN_CHAT_ID обов’язковий; без нього прод фейлиться.
   - File I/O (крос‑платформено):
     - Безпечний FS (ensureDirFor, writeFileAtomic), шляхи через path.join/resolve (Windows/Linux).
     - Завантаження файлів: getFile → HTTP stream → запис на диск з перевірками.
   - Telemetry/retention (basic):
     - Політика для handled‑changes та error logs мінімальна; придатна для Docker.
   - Security:
     - Санітизація JSON (існуючий sanitizer), обмеження розмірів; секрети не зберігати.
   - Tests (дуже детальні й строгі):
     - Поглиблені unit‑тести persistence (mock FS, in‑memory SQLite/ tmp DB), property‑based на ключах.
     - Крос‑платформені кейси (нормалізація шляхів Win/Linux).
     - E2E: text/photo/sticker (щасливі кейси), провал з ❌ + ДМ адмінам; перевірка реакцій і DB записів.

2) Light DI (dependency injection) for persistence
   - Винести PersistenceService: saveMessage(ctx, message, files?) → { ok, filesDir?, error? }
   - Параметризувати: fileDownloader(TG→disk), pathBuilder(userId,messageId), db(repo), reactionsAdapter.
   - Інʼєкція у message/albums хендлери тільки у prod‑шляху.

3) Integration smoke
   - Minimal Bot stub registering all handlers; ensure no throw with mocked contexts.

4) Docs refresh (short and specific)
   - WARP.md: описати prod mode, DB схему, env keys, політику зберігання файлів, адмін‑нотіси (ДМ), реакції.
   - README.md: кроки запуску у Docker (мінімальний Node), volume для data/, змінні оточення.

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

How to continue (actionable checklist — cleaned)
- [ ] Docs polish: finalize WARP.md/README (prod mode summary, env table incl. SCHEMA_REQUESTS_PATH, troubleshooting better-sqlite3 on Windows)
- [ ] Schema-requests tooling: CLI to import/export data/schema-requests.jsonl <-> DB schema_requests (dry-run, dedup)
- [ ] Persistence hardening:
  - [ ] Download retries with backoff; size/header validation; temp file cleanup on error
  - [ ] Preserve original filenames when available; collision-safe naming
  - [ ] WAL/PRAGMA tuning; periodic checkpoint; optional VACUUM schedule
- [ ] Observability:
  - [ ] Structured logs (operation tags); debug level toggle via env
  - [ ] Lightweight metrics (saved messages/attachments/failures)
- [ ] CI matrix: add windows-latest job alongside ubuntu-latest
- [ ] Config refactor: centralize env parsing/validation in src/config.ts (types, defaults, required keys)
- [ ] Tests:
  - [ ] Album edge cases (mixed types, late parts, flush cancellations)
  - [ ] Download error paths and recovery
  - [ ] Reaction API errors and fallbacks
  - [ ] Path normalization with Unicode/special filenames
- [ ] Security/Privacy: extend sanitizer for stored JSON (configurable caps), document data retention knobs
- [ ] Optional: snapshot retention env knobs doc and tests

Future ideas (brain dump)
- Admin digest (optional) summarizing new keys in DM (text-only), no buttons
- One-shot CLI: reindex data/messages/*/* into DB (repair task)
- Backup/export tool: tar.gz of data/messages partitioned per user/time
- Rate-limit Telegram calls and simple queue
- Circuit breaker around Telegram API failures
- Pre-commit hooks: format/lint; basic ESLint+Prettier
- Typed DB mappers and explicit migrations
- File viewer utility for schema-requests.jsonl (+ simple list UI)
- Log rotation for admin failures / api-errors
- Docker image (later): minimal Node base, with data/ volume and native module prebuilt
- Performance: memory footprint for album buffering; streaming write for large files
- Internal event bus to decouple “new keys” hooks from handlers
- Present mode polish: configurable defaults per chat/user
- Health endpoint or self-check command /health
- Telemetry toggles for noisy areas
