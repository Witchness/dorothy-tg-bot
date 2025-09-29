import { describe, expect, it } from "vitest";

describe("analyzer entities more", () => {
  it("captures email and phone entities and builds link insights with fallback", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const text = "mail me test@example.com or call +380 67 123 45 67 and visit invalid_url";
    const entities = [
      { type: "email", offset: 8, length: 16 },
      { type: "phone_number", offset: 29, length: 17 },
      // url without scheme but invalid hostname to force fallback branch
      { type: "text_link", offset: 64, length: 12, url: "invalid_url" },
    ] as any[];
    const res = analyzeMessage({ text, entities } as any);
    // Entities section contains Email and Phones
    const ent = (res.entitiesSection ?? []).join("\n");
    expect(ent).toContain("Email:");
    expect(ent).toContain("Телефони:");
    // Link insights fallback
    const links = (res.linkInsights ?? []).join("\n");
    expect(links).toContain("Link → invalid_url");
  });
});