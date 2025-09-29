import { describe, expect, it } from "vitest";
import { SEED_ENTITY_TYPES, SEED_MESSAGE_KEYS, SEED_SCOPES, buildSeedSamples } from "../../src/seed_catalog.js";

describe("seed_catalog", () => {
  it("contains baseline scopes and keys", () => {
    expect(SEED_SCOPES).toContain("message");
    expect(SEED_MESSAGE_KEYS.message).toContain("text");
    expect(SEED_ENTITY_TYPES.message).toContain("mention");
  });

  it("builds sample descriptions", () => {
    const samples = buildSeedSamples(["text", "photo", "unknown"]);
    expect(samples.text).toBe('"Sample text"');
    expect(samples.photo).toBe("Photo: x1, max=800x600");
    expect(samples.unknown).toBe("");
  });
});
