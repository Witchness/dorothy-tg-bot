# Dorothy Telegram Bot — Agent Guidelines

## 🎯 Проєкт призначення

Цей Telegram бот створено для **Dorothy** — зберігає всі повідомлення, аналізує їх та пересилає звіти адміну. Основні компоненти:

### 📦 Основні модулі

- **src/index.ts** — головний ентріпойнт, grammY Bot, сесії, мідлвари
- **src/persistence/** — збереження в SQLite + файли
  - `schema.ts` — схема БД, міграції
  - `repo.ts` — repository pattern (upsert users/chats, insert messages/attachments)
  - `service.ts` — PersistenceService: saveMessage(), завантаження файлів
- **src/telegram/reactions.ts** — реакції (❤️/👎)
- **src/files/tg_download.ts** — завантаження файлів з Telegram
- **src/handlers/** — обробники (message, albums, callbacks)
- **src/analyzer.ts** — аналіз повідомлень (символи/слова, інсайти)
- **src/registry_*.ts** — система реєстру (scope/keys/types)

Дані зберігаються в `data/`: SQLite БД, JSON файли, завантажені attachments. Секрети в `.env` (не комітимо!).

## Build, Test, and Development Commands
Use `pnpm install` with Node 22+. `pnpm dev` runs the bot via `tsx watch`, ideal for iterative development. `pnpm build` compiles TypeScript into `dist/`. `pnpm start` executes the production build (`dist/index.js`) using the real bot token.

## Coding Style & Naming Conventions
Follow the existing TypeScript style: 2-space indentation, double quotes, trailing semicolons, and ES module syntax. Prefer `camelCase` for variables/functions, `PascalCase` for types, and keep exported helpers pure where possible. Group related exports near the bottom of each module and avoid default exports. Run `pnpm build` before submitting to ensure the code still type-checks.

## Testing Guidelines
Automated tests are not yet configured; introduce them alongside new features when feasible. Aim for focused unit coverage around analyzers and registry helpers, and document manual bot runs (command issued, expected reply). When adding a test suite, wire it to `pnpm test` so future contributors can run a single command.

## Commit & Pull Request Guidelines
The repo currently has no public history—establish Conventional Commit messages (`feat: add callback registry capture`) to keep the log scannable. Each PR should include: a crisp summary, linked task or issue ID, config changes (`.env`, data files) called out explicitly, and a short manual verification note (e.g., command run and bot output). Keep secrets out of commits and update documentation when behavior changes.

## Environment & Security Notes
Do not commit real Telegram tokens. Use `.env.example` to describe required variables, and share sensitive values via secure channels. Regenerate `data/entity-registry.json` with sanitized samples before pushing to avoid leaking user data.

## Presenter & Albums
- Presenter reconstructs message/caption formatting (HTML with safe fallback) and adds insights. Albums are aggregated and presented once (buffer ~800ms).
- Inline buttons allow resending original files (per item) and "send all" for albums. See `presentActions` in `src/index.ts`.
- Quote style is configurable: `/present_quotes html|prefix` or via `PRESENT_QUOTES`.
- Link previews are disabled globally to keep replies compact.

## Useful Commands (dev)
- `/present on|off` — toggle presenter per session (also `PRESENT_DEFAULT`).
- `/present_quotes html|prefix` — choose quote rendering mode.
- `/snapshots off|last-3|all` — retention policy for `data/handled-changes` (env override `SNAPSHOT_HANDLED_CHANGES`).
- `/env_missing` — list absent env vars with suggested defaults.
- `/registry*`, `/reg*` — registry controls.

## Debugging Tips
- Presenter logs: look for `[present] single ...` and `[present] album ...` in the console to trace parse_mode vs fallback and buttons.
- Allowlist: early gate logs `[allowlist] dropped uid=... chat=...`.
- If HTML parse fails (`can't parse entities`), the presenter falls back to plain text automatically.
