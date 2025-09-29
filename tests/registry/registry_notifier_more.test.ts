import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryNotifier } from "../../src/registry_notifier.js";

describe("registry_notifier (more)", () => {
  beforeEach(() => vi.useFakeTimers());

  it("flushAll flushes all chat queues and hasPending reflects state", async () => {
    const onFlush = vi.fn();
    const notifier = createRegistryNotifier({ debounceMs: 10, onFlush });

    notifier.queue(1, { diff: { newScopes: [{ scope: "a", status: "needs-review" }] }, context: { a: 1 } });
    notifier.queue(2, { diff: { newEntityTypes: [{ scope: "message", type: "mention", status: "process" }] }, context: { b: 2 } });

    expect(notifier.hasPending(1)).toBe(true);
    expect(notifier.hasPending(2)).toBe(true);

    await notifier.flushAll();
    expect(onFlush).toHaveBeenCalledTimes(2);
    const scopes = onFlush.mock.calls.map((c) => c[0].diff);
    expect(scopes.some((d: any) => d.newScopes?.length === 1)).toBe(true);
    expect(scopes.some((d: any) => d.newEntityTypes?.length === 1)).toBe(true);
  });

  it("swallows onFlush errors (does not throw)", async () => {
    const onFlush = vi.fn(() => { throw new Error("fail"); });
    const notifier = createRegistryNotifier({ debounceMs: 5, onFlush });
    notifier.queue(10, { diff: { newScopes: [{ scope: "x", status: "needs-review" }] }, context: {} });
    await vi.advanceTimersByTimeAsync(10);
    // No throw expected, call count increments despite error path
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});