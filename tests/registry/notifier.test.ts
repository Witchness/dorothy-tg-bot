import { describe, expect, it } from "vitest";
import { formatDiffReport } from "../../src/notifier.js";

describe("formatDiffReport", () => {
  it("returns null for empty diff", () => {
    expect(formatDiffReport({})).toBeNull();
  });

  it("formats sections with badges", () => {
    const diff = formatDiffReport({
      newScopes: [{ scope: "message", status: "process" }],
      newMessageKeys: [
        { scope: "message", key: "text", status: "ignore", sample: '"hi"' },
        { scope: "message", key: "photo", status: "needs-review" },
      ],
      newEntityTypes: [{ scope: "message", type: "mention", status: "needs-review" }],
    });
    expect(diff).toContain("Нові типи апдейтів");
    expect(diff).toContain("✅ process");
    expect(diff).toContain("🚫 ignore");
    expect(diff).toContain("🟨 needs-review");
    expect(diff).toContain("приклад: \"hi\"");
  });
});
