import { describe, expect, it } from "vitest";
import {
  ALL_UPDATES_9_2,
  ALL_UPDATES_9_2_SET,
  MEDIA_GROUP_HOLD_MS,
  MINIMAL_UPDATES_9_2,
  MINIMAL_UPDATES_9_2_SET,
  isKnownUpdateName,
} from "../../src/constants.js";

describe("constants", () => {
  it("exposes minimal updates subset", () => {
    expect(MINIMAL_UPDATES_9_2).toEqual(["message", "edited_message", "callback_query"]);
    for (const update of MINIMAL_UPDATES_9_2) {
      expect(ALL_UPDATES_9_2).toContain(update);
      expect(MINIMAL_UPDATES_9_2_SET.has(update)).toBe(true);
    }
  });

  it("tracks all updates via set for fast lookup", () => {
    expect(ALL_UPDATES_9_2.length).toBeGreaterThan(20);
    expect(ALL_UPDATES_9_2_SET.size).toBe(ALL_UPDATES_9_2.length);
    expect(isKnownUpdateName("message")).toBe(true);
    expect(isKnownUpdateName("nonexistent" as any)).toBe(false);
  });

  it("uses consistent media group hold duration", () => {
    expect(MEDIA_GROUP_HOLD_MS).toBe(800);
  });
});
