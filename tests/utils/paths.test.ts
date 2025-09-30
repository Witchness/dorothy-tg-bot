import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { toPosixRelative } from "../../src/utils/paths.js";

describe("utils/paths toPosixRelative", () => {
  it("normalizes separators to '/' and yields 'data/...'", () => {
    const base = process.cwd();
    const abs = join(base, "data", "messages", "123", "456");
    const rel = toPosixRelative(abs, base);
    expect(rel).toBe("data/messages/123/456");
    expect(rel.includes("\\")).toBe(false);
  });
});