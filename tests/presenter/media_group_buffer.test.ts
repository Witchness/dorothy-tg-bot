import { describe, expect, it } from "vitest";
import { drainMediaGroupEntry, type MediaGroupBufferEntry } from "../../src/media_group_buffer.js";

describe("drainMediaGroupEntry", () => {
  it("returns and removes buffered entry", () => {
    const timer = setTimeout(() => {}, 0);
    clearTimeout(timer);
    const store = new Map<string, MediaGroupBufferEntry<string>>([
      ["album", { ctx: "ctx", items: [1, 2], timer }],
    ]);
    const entry = drainMediaGroupEntry(store, "album");
    expect(entry).toMatchObject({ ctx: "ctx", items: [1, 2] });
    expect(store.has("album")).toBe(false);
  });

  it("returns undefined when entry missing", () => {
    const store = new Map<string, MediaGroupBufferEntry<string>>();
    expect(drainMediaGroupEntry(store, "absent")).toBeUndefined();
  });
});
