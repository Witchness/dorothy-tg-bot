import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
let clock = 1;

const setFile = (path: string, content: string) => {
  files.set(path, content);
  clock += 1;
};

const existsSync = vi.fn((path: string) => files.has(path));
const readFileSync = vi.fn((path: string) => {
  const value = files.get(path);
  if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return value;
});
const writeFileSync = vi.fn((path: string, content: string) => {
  setFile(path, content);
});
const mkdirSync = vi.fn();

vi.mock("node:fs", () => ({ existsSync, readFileSync, writeFileSync, mkdirSync }));
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { ...actual, resolve: (...segments: string[]) => segments.join("/") };
});

const loadModule = async () => await import("../../src/entity_registry.js");

beforeEach(() => {
  files.clear();
  clock = 1;
  existsSync.mockClear();
  readFileSync.mockClear();
  writeFileSync.mockClear();
  mkdirSync.mockClear();
  vi.resetModules();
});

describe("entity_registry", () => {
  it("tracks updates, message keys and entity types", async () => {
    const registry = await loadModule();
    expect(writeFileSync).toHaveBeenCalled(); // initial snapshot

    const newUpdates = registry.recordUpdateKeys(["message", "edited_message", "new_scope"]);
    expect(newUpdates).toEqual(["edited_message", "new_scope"]);

    const newKeys = registry.recordMessageKeys(["text", "novel"]);
    expect(newKeys).toEqual(["novel"]);

    expect(registry.recordEntityType("mention")).toBe(false);
    expect(registry.recordEntityType("new_type")).toBe(true);

    const payloadKeys = registry.recordPayloadKeys("message.reply_to_message", ["text", "user"]);
    expect(payloadKeys).toEqual(["user"]);
    expect(registry.recordCallbackKeys(["id"])).toEqual([]);
    expect(registry.recordInlineQueryKeys(["query"])).toEqual([]);

    const apiKeys = registry.recordApiShape("sendMessage", { ok: true, result: { message_id: 1 } });
    expect(apiKeys).toEqual([]);
    const arrayApi = registry.recordApiShape("getUpdates", [{ update_id: 1 }]);
    expect(arrayApi).toContain("[array]");
    expect(arrayApi).toContain("item.update_id");

    const sets = registry.snapshotSets();
    expect(sets.updateKeySet.has("new_scope")).toBe(true);
    expect(sets.messageKeySet.has("novel")).toBe(true);
    expect(sets.textEntitySet.has("new_type")).toBe(true);
  });

  it("categorizes sample labels", async () => {
    const registry = await loadModule();
    expect(registry.categorizeSampleLabel("update")).toBe("handled");
    expect(registry.categorizeSampleLabel("api_sendMessage")).toBe("handled");
    expect(registry.categorizeSampleLabel("payload:update.message")).toBe("handled");
    expect(registry.categorizeSampleLabel("unknown" as any)).toBe("unknown");
  });
});
