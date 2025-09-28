# Code Review Suggestions

## Critical bugs & regressions
1. **Self-rescheduling registry refresh never writes anything** – `scheduleRegistryMarkdownRefresh` only clears/re-arms its own timer and then calls itself again, so once triggered it loops forever without ever rebuilding the Markdown snapshot. Any command that relies on the debounced writer (e.g. inline note saves, scope diffs, registry seeding) never updates `data/entity-registry.md`, and the idle timer keeps firing every second. Extract the actual flush logic (building Markdown + writing to disk) into this handler before it reschedules itself.【F:src/index.ts†L65-L77】
2. **Allowlist middleware runs after all instrumentation** – we record update/payload keys, persist snapshots, and even reply in chat before checking whether the sender is allow-listed. That means blocked users can still mutate the registry, spam `/registry` hints, and create log files. Move the allowlist check ahead of the heavy observer middleware (or early-return inside it) so untrusted updates short-circuit before any side effects fire.【F:src/index.ts†L197-L274】

## Reliability & observability gaps
3. **Array payload snapshots may miss the new key you just detected** – when `registerPayload` inspects arrays, it merges keys from up to five objects but then stores the *first* object in the array. If the new key lives only in later elements, the saved sample lacks the evidence you need to debug. Grab the actual element that contributed the unseen key (or sanitize a merged object) before calling `storeUnhandledSample`.【F:src/analyzer.ts†L60-L87】

## Developer experience & maintainability
4. **Media group handling copies ~70 lines of logic** – the two album branches share identical analysis, history updates, and alert formatting. When you tweak one branch, it’s easy to forget the other, and we already do extra `analyzeMediaGroup` work in both. Extract a helper that both the “present buffer” and “first element” paths call so album behavior stays in sync.【F:src/index.ts†L361-L454】
5. **Single-message analysis runs twice** – after composing the main reply, we call `analyzeMessage` again just to surface payload alerts, doubling CPU/memory cost on every text message. Reuse the original `analysis` result or split alert extraction into a helper to keep latency down.【F:src/index.ts†L458-L504】

