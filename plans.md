# Plans & Roadmap

## Immediate (Interactive Gating)
- Finalise per-scope gating for all Update types we receive when `ALLOWED_UPDATES=all`.
- Keep per-message keyboards strictly scoped to present keys/types only.
- Suppress dev prompts for keys marked `ignore`; show prompts only for `needs-review`.
- Ensure scope `ignore` remains fully silent in all modes.

## Quality of Life
- Add optional status “badges” in event text (e.g., `[process]`, `[ignore]`) without editing message frequently.
- Improve inline keyboard update flows to handle edited text/markdown collisions safely.
- Add “process now” action to re-run analysis after enabling keys.

## Coverage
- Extend event summaries to remaining Update types (poll, poll_answer, chat_member, message_reaction, chat_boost, purchased_paid_media, etc.) with the same per-scope gating UX.
- Expand human-friendly samples in `humanize.ts` for remaining media and service payloads.

## Data & Commands
- Stabilise `data/registry-status.json` schema; document in README.
- Harden `/registry_reset` (atomic writes, better error reporting) and add `/registry_wipe_logs` if needed.
- Add `/reg_note <scope|key|type> <name> <text…>` power command to set notes without the inline flow.

## Bot API Awareness
- Keep `MINIMAL_UPDATES_*` / `ALL_UPDATES_*` lists current after each Telegram release.
- Track removed/renamed fields in handled snapshots (`data/handled-changes/`) before bumping Bot API versions.
- Curate `data/api-errors/` to spot regressions.

## Resilience & Performance
- Evaluate `@grammyjs/runner` for concurrent polling.
- Introduce throttling/backoff for 429/5xx.

## Testing & DX
- Add a minimal Vitest suite for `registry_status`, `registry_config`, and `humanize` helpers.
- Consider fixtures for Update payloads to simulate common flows.
