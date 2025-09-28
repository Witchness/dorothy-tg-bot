# Code Review Suggestions

## High Priority

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

