# Code Review Suggestions (updated)

## High Priority

1. Allow inline queries to reach the bot.
   - Problem: The polling startup uses a minimal allowed updates set, while the bot registers an `inline_query` handler, so inline events won’t arrive with `ALLOWED_UPDATES=minimal`.
   - Impact: Inline query support and sampling won’t run under the minimal set.
   - Recommendation: Run with `ALLOWED_UPDATES=all` when inline mode is needed (now warned at startup). Optionally widen the minimal preset to include `inline_query`.

2. Deepen payload shape signatures when storing samples.
   - Problem: Signature generation limits (depth/keys/items) can miss nested Bot API changes.
   - Impact: Schema regressions deep in the tree may not trigger new snapshots.
   - Recommendation: Raise or make configurable recursion depth and key/item caps for signature generation.

## Medium Priority

3. Regenerate the Markdown registry snapshot off the hot path.
   - Observation: Markdown rebuilding happens synchronously before replies, adding latency on large registries.
   - Recommendation: Debounce or background the refresh to keep chat interactions snappy.

## Low Priority

4. Extend snapshot sanitisation limits for diagnostics.
   - Observation: Tight limits keep files small but can hide useful context.
   - Recommendation: Make sanitisation limits environment-configurable (stricter in prod, richer in dev/QA).
