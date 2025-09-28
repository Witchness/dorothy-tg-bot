# Code Review Suggestions

## Resolved / Not an issue
- Self-rescheduling registry refresh: not reproducible. Our `scheduleRegistryMarkdownRefresh` writes the Markdown snapshot once and clears the timer; it does not call itself.
- Allowlist order: fixed. Early allowlist gate added before any registry instrumentation.
- Array payload snapshot: fixed. We now store a merged representative object for arrays, not just the first element.
- Media-group duplication: fixed. Shared logic extracted into `flushMediaGroupBuffer`.
- Double `analyzeMessage`: fixed. We reuse the analysis result for alerts.

## New suggestions
1. Add “custom” updates mode
   - Rationale: Current `ALLOWED_UPDATES` supports `minimal` or `all`. Add `custom` with `ALLOWED_UPDATES_LIST=message,edited_message,callback_query,inline_query` for fine-grained control.

2. Retention for handled changes (last-3) — done
   - Implemented pruning in `storeSnapshot`: when policy is `last-3`, keep only the last 3 snapshots per label inside `data/handled-changes/`.

3. Safer long-text fallback in /registry text mode
   - Rationale: Fallback chunking in `/registry` and `/registry_refresh` uses naive slicing and may split surrogate pairs. Reuse the codepoint-aware chunker from `replySafe` (without parse_mode) for the text fallback path.

4. Unify allowlist check (cleanup)
   - Rationale: After adding the early gate, the later allowlist middleware is redundant. Remove the second gate to simplify the chain.

5. Optional prod toggle for snapshots
   - Rationale: Provide an env flag (e.g., `SNAPSHOT_STORE=off`) to disable snapshot writes entirely in strict prod environments, while keeping registry status updates.

6. Admin-safe sends
   - Rationale: Wrap admin notifications with a `sendSafeMessage` helper (like `replySafe`) to avoid rare UTF-8/chunk issues in alerts as payload sizes grow.

7. Privacy redaction
   - Rationale: Add lightweight redaction in sanitization (e.g., replace obvious phone/email/usernames) before persisting samples to further reduce PII risk.

8. Tests (targeted)
   - Rationale: Add minimal unit tests for: codepoint chunker, media-group buffer flush, allowlist gating order, and array-merge snapshot logic. Wire to `pnpm test`.

