import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryNotifier } from "../../src/registry_notifier.js";

describe("createRegistryNotifier", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("debounces flushes and merges diffs", async () => {
    const onFlush = vi.fn();
    const notifier = createRegistryNotifier({ debounceMs: 20, onFlush });
    notifier.queue(123, {
      diff: { newScopes: [{ scope: "message", status: "needs-review" }] },
      context: { id: 1 },
      replyTo: 10,
    });
    notifier.queue(123, {
      diff: {
        newScopes: [{ scope: "edited_message", status: "process" }],
        newMessageKeys: [{ scope: "message", key: "photo", status: "needs-review", sample: "sample" }],
      },
      context: { id: 2 },
    });

    await vi.advanceTimersByTimeAsync(25);

    expect(onFlush).toHaveBeenCalledTimes(1);
    const payload = onFlush.mock.calls[0][0];
    expect(payload.chatId).toBe(123);
    expect(payload.context).toEqual({ id: 2 });
    expect(payload.replyTo).toBe(10);
    expect(payload.diff.newScopes).toHaveLength(2);
    expect(payload.diff.newMessageKeys).toEqual([
      { scope: "message", key: "photo", status: "needs-review", sample: "sample" },
    ]);
  });

  it("supports manual flush", async () => {
    const onFlush = vi.fn();
    const notifier = createRegistryNotifier({ debounceMs: 50, onFlush });
    notifier.queue(1, { diff: { newScopes: [{ scope: "callback_query", status: "needs-review" }] }, context: {} });
    await notifier.flush(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});
