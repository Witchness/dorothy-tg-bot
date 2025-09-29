import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const mtimes = new Map<string, number>();
let tick = 1;

const setFile = (path: string, content: string) => {
  files.set(path, content);
  mtimes.set(path, tick++);
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
const statSync = vi.fn((path: string) => {
  if (!files.has(path)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return { mtimeMs: mtimes.get(path) ?? 0 };
});
const readdirSync = vi.fn((dir: string) => {
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  const names: string[] = [];
  for (const key of files.keys()) {
    if (key.startsWith(prefix)) {
      names.push(key.slice(prefix.length));
    }
  }
  return names;
});
const rmSync = vi.fn((path: string) => {
  files.delete(path);
  mtimes.delete(path);
});

vi.mock("node:fs", () => ({ existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, rmSync }));
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { ...actual, resolve: (...segments: string[]) => segments.join("/") };
});

const loadModule = async () => await import("../../src/registry_status.js");

beforeEach(() => {
  files.clear();
  mtimes.clear();
  tick = 1;
  existsSync.mockClear();
  readFileSync.mockClear();
  writeFileSync.mockClear();
  mkdirSync.mockClear();
  statSync.mockClear();
  readdirSync.mockClear();
  rmSync.mockClear();
  vi.resetModules();
});

describe("RegistryStatus", () => {
  it("tracks observations and applies overrides", async () => {
    vi.useFakeTimers();
    try {
      const { RegistryStatus } = await loadModule();
      const status = new RegistryStatus("/tmp/status.json", 0);

      const diff = status.observeScopes(["message", "album"]);
      expect(diff).toEqual([
        { scope: "message", status: "needs-review" },
        { scope: "album", status: "needs-review" },
      ]);
      await vi.runAllTimersAsync();

      const keys = status.observeMessageKeys("message", ["text", "photo"], { text: '"hi"' });
      expect(keys).toContainEqual({ scope: "message", key: "photo", status: "needs-review", sample: undefined });
      const types = status.observeEntityTypes("message", ["mention", "new_type"]);
      expect(types).toContainEqual({ scope: "message", type: "new_type", status: "needs-review" });

      status.setScopeStatus("album", "ignore");
      status.setMessageKeyStatus("message", "photo", "process");
      status.setEntityTypeStatus("message", "new_type", "ignore");
      await vi.runAllTimersAsync();

      expect(status.getScopeStatus("album")).toBe("ignore");
      expect(status.isScopeIgnored("album")).toBe(true);
      expect(status.getMessageKeyStatus("message", "photo")).toBe("process");
      expect(status.getEntityTypeStatus("message", "new_type")).toBe("ignore");

      status.saveNow();
      const snapshot = status.snapshot();
      expect(snapshot.keysByScope.message.text.sample).toBe('"hi"');
      expect(snapshot.keysByScope.message.photo.status).toBe("process");

      // Provide config override
      const { default: pathModule } = await vi.importActual<typeof import("node:path")>("node:path");
      const configPath = pathModule.resolve(process.cwd(), "data", "registry-config.json");
      setFile(configPath, JSON.stringify({ mode: "prod", scopes: { album: { status: "process", note: "override" } } }));

      const diffOverride = status.observeScopes(["album"]);
      expect(diffOverride).toEqual([]);
      expect(status.getMode()).toBe("prod");
      expect(status.snapshot().scopes.album.note).toBe("override");
    } finally {
      vi.useRealTimers();
    }
  });

  it("seeds from handled snapshot when available", async () => {
    const { default: pathModule } = await vi.importActual<typeof import("node:path")>("node:path");
    const handledPath = pathModule.resolve(process.cwd(), "data", "handled", "registry.json");
    setFile(handledPath, JSON.stringify({
      updateKeys: ["message"],
      messageKeys: ["text"],
      textEntityTypes: ["mention"],
    }));

    const { RegistryStatus } = await loadModule();
    const status = new RegistryStatus("/tmp/status.json", 0);
    expect(status.snapshot().keysByScope.message.text.status).toBe("process");
  });
});
