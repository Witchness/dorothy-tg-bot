# Production-Level Roadmap

## Bot API Awareness
- Keep `MINIMAL_UPDATES_*` / `ALL_UPDATES_*` matrices current in the README after each Telegram release.
- Capture changelog diffs and highlight removed/renamed fields before bumping Bot API versions.
- Maintain registry coverage for Updates, Messages, nested payloads, and API responses via `data/handled/`, `data/handled-changes/`, and `data/unhandled/` (all stored as `label__<signature>.json`).
- Curate `data/api-errors/` (deduped by description + payload) to spot regressions in Telegram responses.

## Resilience & Performance
- Evaluate `@grammyjs/runner` for concurrent polling and backpressure.
- Introduce `@grammyjs/transformer-throttler` plus exponential backoff helpers for 429/5xx responses.
- Harden retry logic for API outages (429, 5xx, timeouts) before dispatching alerts.

## Feature Coverage
- Track new Telegram surfaces: channel direct messages, Suggested Posts, Telegram Stars, business_message threads.
- Expand “smart” analyzers: richer attachment descriptions, link intelligence (YouTube, GitHub, etc.), and summarisation heuristics.
- Auto-generate TODO/alert items whenever new registry keys appear without matching handlers.

## Observability
- Instrument OpenTelemetry (HTTP/Express/grammY) with OTLP export to central tracing.
- Wire `pino-opentelemetry-transport` for structured logs.
- Add `/healthz` (liveness) and `/readyz` (readiness for DB/Redis/S3) endpoints; fail polling loop when readiness breaks.

## Deployment Footprint
- Prepare webhook deployments: Cloudflare Workers, Deno Deploy, or long-running Node (PM2/systemd) with `secret_token` validation.
- Prototype Local Bot API (TDLib, GHCR) for offline testing; manage TELEGRAM_API_ID/HASH secrets and storage lifecycle.
- Set up CI/CD (GitHub Actions) for lint, typecheck, and test matrices on Node 22, Bun, and Deno.

## Security
- Enforce secret webhook headers and optional IP allowlists / Cloudflare Rules.
- Minimise PII in logs (file_id, phone, full text) via redaction and safe sampling utilities.
- Validate env vars with Zod (or similar) and block deploys when required vars are missing.

## DX Improvements
- Adopt Biome or ESLint+Prettier bundles; add pre-commit hooks for lint + typecheck.
- Introduce Vitest with `nock`/`msw` to simulate Telegram API; add smoke tests for rate-limit/error paths.
- Build CLI helpers (`npm run debug`, `/reset`, `/config`) to speed local troubleshooting.
