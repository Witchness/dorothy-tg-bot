# Code Review Suggestions

## High Priority


1. **Allow inline queries to reach the bot.**
   *Problem:* The polling startup only requests `message`, `edited_message`, and `callback_query` updates, but the bot also registers an `inline_query` handler. Because `inline_query` is missing from `MINIMAL_UPDATES_9_2`, Telegram never delivers inline queries, so that handler and its registry logging never run.【F:src/constants.ts†L1-L7】【F:src/index.ts†L317-L335】
   *Impact:* Inline query support, payload sampling, and admin notifications silently fail even though the code looks present.
   *Recommendation:* Add `"inline_query"` (and any other supported update types) to the allowed updates list or make it configurable so the polling mode actually receives the events the bot handles.

2. **Persist usage metrics for known scopes, keys, and entity types.**
   *Problem:* The middleware passes only brand-new keys into `RegistryStatus.observe*`, so existing scopes/keys/types never reach the `ensure*` helpers. Even when they did, the save is throttled to cases where something was “added”, so `seen` counters and `lastSeen` timestamps for known entries are never flushed to disk.【F:src/index.ts†L103-L153】【F:src/registry_status.ts†L135-L205】
   *Impact:* `registry-status.json` quickly becomes stale, `/registry` output can’t be trusted, and you lose the ability to reason about how often a key actually appears.
   *Recommendation:* Invoke the observers with the full set observed on every update/message, track whether `ensure*` mutated an existing entry, and schedule a save whenever counters advance so telemetry reflects reality.

3. **Deepen payload shape signatures when storing samples.**
   *Problem:* `collectShapePaths` stops recursing once depth reaches 2 and caps object keys at 15/array items at 5 when computing signatures and sanitised samples. Any Bot API change deeper in the tree or beyond the first 15 keys therefore goes unnoticed, so `handled-changes` snapshots will miss real schema regressions.【F:src/unhandled_logger.ts†L10-L188】
   *Impact:* New nested fields (e.g., `message.chat.background.colors.primary`) or optional keys appended near the end of Telegram objects never trigger a signature change, undermining the early-warning system this logger is meant to provide.
   *Recommendation:* Raise the recursion depth and key/item limits (or make them adaptive), at least for signature generation, so nested structure changes surface in new snapshot files.

## Medium Priority

4. **Sample multiple elements when inspecting array payloads.**
   *Problem:* `registerPayload` only inspects the first object-like element it finds in an array. Telegram often appends richer metadata to later items (e.g., the largest photo size), so new fields there never hit the registry or sample store.【F:src/analyzer.ts†L51-L78】
   *Impact:* Array payloads can evolve without detection, leaving blind spots in `entity-registry.json` and missing admin alerts.
   *Recommendation:* Merge keys from several items (up to a small cap) or iterate until no new fields appear, so late-array additions also raise alerts.

5. **Fix the conversation numbering in `/history` replies.**
   *Problem:* The message header uses `ctx.session.history.length`, but the history array is trimmed back to the last 10 entries. After the 11th message, the bot still responds with `Повідомлення #10`, which is confusing for operators comparing logs.【F:src/index.ts†L195-L203】
   *Impact:* History previews mislabel turns, making it harder to correlate conversations with external tooling.
   *Recommendation:* Track a separate monotonic counter in the session (e.g., `totalMessages`) and use that for the header while keeping the bounded history buffer.

6. **Capture `reply_markup` structures alongside other payloads.**
   *Problem:* The analyzer registers many nested payloads (photos, polls, reactions, etc.) but never inspects `message.reply_markup`, so new inline keyboard fields or flags won’t be recorded or sampled.【F:src/analyzer.ts†L222-L372】
   *Impact:* Telegram can change reply markup JSON without any alert, defeating one of the bot’s primary goals.
   *Recommendation:* Call `registerPayload("message.reply_markup", message.reply_markup, alerts)` and consider sampling keyboard button arrays so markup evolutions surface.

## Low Priority

7. **Regenerate the Markdown registry snapshot off the hot path.**
   *Observation:* Every diff response synchronously rebuilds and writes `data/entity-registry.md` before replying to the chat. On slower disks or larger registries this adds noticeable latency to user-facing messages.【F:src/index.ts†L112-L126】【F:src/index.ts†L352-L366】
   *Recommendation:* Debounce or background the Markdown refresh (e.g., queue a job or reuse the registry’s throttle) while keeping the file eventual-consistent.

8. **Extend snapshot sanitisation limits for diagnostics.**
   *Observation:* The current 200-character string and 15-key/object caps keep files compact but can hide meaningful context when debugging complex payloads.【F:src/unhandled_logger.ts†L10-L88】
   *Recommendation:* Consider making these caps configurable per environment (tight in production, generous in QA) so reviewers can opt into richer diagnostics when needed.
=======
1. **Persist usage metrics for known update/message/entity entries in `RegistryStatus`.**
   *Problem:* `observeScopes`, `observeMessageKeys`, and `observeEntityTypes` call the `ensure*` helpers for every item, which increments `seen` and updates `lastSeen`, but they only schedule a save when a brand-new item is discovered. As a result, counters for existing scopes/keys/types are never flushed to disk, so `registry-status.json` drifts out of sync after restarts. Moreover, the middleware passes only `newUpdateKeys`, `newKeys`, and `newTypes` into these observers, meaning known scopes never even reach the `ensure*` logic and their `seen`/`lastSeen` values remain stuck at the seeding timestamp.【F:src/registry_status.ts†L135-L205】【F:src/index.ts†L103-L227】
   *Suggestion:* Always invoke the observers with the full list of scopes/keys/types seen in the update, and schedule a save whenever `ensure*` mutates an existing entry (e.g., track a `changed` flag when `seen`/`lastSeen` advance). This keeps telemetry accurate and makes `/registry` snapshots trustworthy.

## Medium Priority

2. **Broaden payload inspection for array payloads.**
   *Problem:* `registerPayload` only inspects the first object-like element it finds in an array payload, so new fields appearing deeper in the array are silently ignored. This is common for collections such as `message.photo`, where Telegram may append larger sizes with additional metadata. Missing those keys prevents `entity-registry.json` from capturing the true schema.【F:src/analyzer.ts†L51-L78】
   *Suggestion:* Iterate over several elements (or merge keys from every object up to a safe limit) before returning, so new fields in later items also trigger registry updates and stored samples.

3. **Improve conversation numbering in history replies.**
   *Problem:* The user-facing header derives the message index from `ctx.session.history.length`, but the array is truncated to the most recent 10 entries. After more than 10 interactions, the header for the next reply still says `Повідомлення #10`, which is misleading.【F:src/index.ts†L195-L203】
   *Suggestion:* Track a separate monotonically increasing counter (e.g., `totalMessages`) in the session so the numbering reflects the actual turn count even while the history buffer stays bounded.

## Low Priority

4. **Refresh handled registry markdown asynchronously.**
   *Observation:* Every time a diff is reported, the bot regenerates `data/entity-registry.md` synchronously before replying. For large registries this can add latency to chat responses.【F:src/index.ts†L112-L235】
   *Suggestion:* Spawn the Markdown regeneration in the background (e.g., `void Promise.resolve().then(...)`) or debounce it similarly to `RegistryStatus` writes, keeping the chat interaction snappy while still maintaining up-to-date artifacts.


