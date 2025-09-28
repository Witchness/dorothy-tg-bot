# Suggestions

## Critical issues to address
1. **`RegistryStatus.reset` ignores its `seedFromHandled` argument.** The method always discards existing data and never rehydrates from handled snapshots, even when callers pass `true`. This makes recovery from historical data impossible and contradicts the method signature/comment. Teach `reset` to optionally reseed from `data/handled/registry.json` when the flag is set before writing the fresh file. 【F:src/registry_status.ts†L148-L152】【F:src/registry_status.ts†L74-L118】

2. **Admin alerts can hit Telegram's 4096-character limit and throw.** `notifyAdmin` sends raw strings through `bot.api.sendMessage` without chunking, while other replies go through `replySafe`. A long diff (e.g., many new keys) will raise `400 MESSAGE_TOO_LONG` and drop the alert. Reuse `replySafe` or similar chunking when posting to `ADMIN_CHAT_ID`. 【F:src/index.ts†L291-L331】【F:src/index.ts†L200-L239】

3. **`noop` buttons spam chat with callback summaries.** The label rows in registry keyboards use `callback_data="noop"`, but there is no dedicated handler; presses fall into the generic callback logger, which replies with a verbose summary. Add an early handler that simply answers `noop` callbacks to keep chats clean. 【F:src/registry_actions.ts†L13-L21】【F:src/registry_actions.ts†L87-L95】【F:src/index.ts†L900-L939】

## High-impact improvements
4. **Persisted samples still contain PII.** `sanitizeValue` merely truncates strings; it does not redact names, emails, phone numbers, etc. The snapshots written by `storeSnapshot` can therefore store sensitive data under `data/unhandled/`. Add lightweight redaction (e.g., replace emails/phones/usernames) before writing to disk. 【F:src/unhandled_logger.ts†L62-L101】【F:src/unhandled_logger.ts†L200-L238】

5. **Array payload scanning misses late keys.** `registerPayload` inspects only the first five object items in an array. Telegram often appends the richest variant at the end (e.g., highest-resolution photo), so new properties there are ignored and never trigger alerts. Expand sampling to include tail items or iterate the whole array with a safety cap on work. 【F:src/analyzer.ts†L51-L83】

6. **Registry markdown refresh should be atomic.** `scheduleRegistryMarkdownRefresh` writes directly to `data/entity-registry.md`. If the process crashes mid-write, the file can be truncated, breaking downstream tooling. Write to a temp file and rename to guarantee atomic updates. 【F:src/index.ts†L140-L168】

7. **Large diffs silently truncate inline keyboards.** The `maxRows` guard in `buildInlineKeyboardForDiff` stops after ~6 items (each consumes two rows), so extra scopes/keys are dropped without indication. Add an overflow line (e.g., “+N more…”) or pagination so reviewers know more items await attention. 【F:src/registry_actions.ts†L10-L55】

## Future-facing ideas
8. **Rate-limit registry status notifications.** When multiple updates arrive together, every `recordUpdateKeys` call can schedule a markdown refresh and reply in chat. Introduce a short-lived queue or combine diffs before messaging to cut noise for operators. 【F:src/index.ts†L300-L360】【F:src/index.ts†L360-L420】
