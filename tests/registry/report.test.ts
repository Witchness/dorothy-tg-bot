import { describe, expect, it } from "vitest";
import { buildRegistryMarkdown } from "../../src/report.js";
import type { StatusRegistryFile } from "../../src/registry_status.js";

describe("buildRegistryMarkdown", () => {
  it("builds markdown summary", () => {
    const reg: StatusRegistryFile = {
      version: 1,
      updatedAt: "2024-01-01T00:00:00.000Z",
      scopes: {
        message: { status: "process", seen: 1, firstSeen: "", lastSeen: "" },
        edited_message: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "", note: "check" },
      },
      keysByScope: {
        message: {
          text: { status: "process", seen: 1, firstSeen: "", lastSeen: "" },
          caption: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "", note: "rare" },
        },
      },
      entityTypesByScope: {
        message: {
          mention: { status: "process", seen: 1, firstSeen: "", lastSeen: "" },
          hashtag: { status: "ignore", seen: 1, firstSeen: "", lastSeen: "" },
          bold: { status: "needs-review", seen: 1, firstSeen: "", lastSeen: "", note: "style" },
        },
      },
    };

    const markdown = buildRegistryMarkdown(reg);
    expect(markdown).toContain("# Entity Registry");
    expect(markdown).toContain("Оновлено: 2024-01-01T00:00:00.000Z");
    expect(markdown).toContain("Message keys");
    expect(markdown).toContain("entity types");
    expect(markdown).toContain("Примітки");
  });
});
