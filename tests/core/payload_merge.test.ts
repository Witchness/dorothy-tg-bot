import { describe, expect, it } from "vitest";
import { mergeArrayObjectSamples } from "../../src/payload_merge.js";

describe("mergeArrayObjectSamples", () => {
  it("captures keys from head and tail samples", () => {
    const payload = [
      { a: 1 },
      { b: 2 },
      { c: 3 },
      { d: 4 },
      { e: 5 },
      { f: 6 },
      { g: 7 },
      { h: 8 },
    ];
    const { keys, merged } = mergeArrayObjectSamples(payload, 2, 4);
    expect(keys).toEqual(["a", "b", "g", "h"]);
    expect(Object.keys(merged)).toContain("h");
  });

  it("deduplicates keys while preserving first seen value", () => {
    const payload = [
      { a: 1, shared: "first" },
      { shared: "second" },
    ];
    const { keys, merged } = mergeArrayObjectSamples(payload, 2, 2);
    expect(keys).toEqual(["a", "shared"]);
    expect(merged.shared).toBe("first");
  });

  it("ignores non-object entries", () => {
    const payload = [{ a: 1 }, null, 42, "str", { b: 2 }];
    const { keys } = mergeArrayObjectSamples(payload, 5, 5);
    expect(keys).toEqual(["a", "b"]);
  });
});
