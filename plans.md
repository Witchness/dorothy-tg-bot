# Project plan — Refactor and Hardening Roadmap (dorothy-tg-bot)

This plan tracks the roadmap. Sections: Done / Next / Backlog. Keep it short and actionable.

Done
- (порожньо) — очищено 2025‑09‑30 для фокусу на актуальних кроках

Next
- Reactions reliability
  - Ensure setMessageReaction works across private/group/supergroup; add telemetry logs when Telegram rejects reactions (method, reason).
  - Keep soft fallback (temporary emoji message with auto-delete), but make it configurable (REACTION_FALLBACK=on|off).
- Persistence hardening (always-on)
  - Engines: switch to Node 20 LTS officially (package.json engines, README). Add install note: pnpm approve-builds better-sqlite3.
  - File-only graceful mode: if DB open fails, persist files/messages.json but still react 👌/❌; DM admin with a one-time warning.
  - Tests to ensure persistence happens before any gating (guard against regressions).
- Debug sink quality
  - Deduplicate admin debug posts per message_id (TTL map) to avoid duplicates (як з «133»).
  - Albums: ensure single admin post per album; no duplicates per part.
- Admin notifications for API new-keys
  - Mirror payload buttons (exp/expall/🗒 JSON) for API methods new-keys digests in admin DM (compact format).
- Admin-only commands guard
  - Ensure middleware blocks commands outside ADMIN_CHAT_ID. Add test.
- Config centralization
  - Create src/config.ts with typed getters: TELEGRAM_MODE, REGISTRY_MODE, PERSIST, ADMIN_CHAT_ID, DB path, DATA dir; validate at startup.
- Docs
  - README/WARP.md: update modes (TELEGRAM_MODE, REGISTRY_MODE=debug|prod), PERSIST=on default, Node 20 LTS, troubleshooting (Windows), admin-only commands.
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
