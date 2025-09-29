import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const mtimes = new Map<string, number>();
let clock = 1;

const setFile = (path: string, content: string) => {
  files.set(path, content);
  mtimes.set(path, clock++);
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

const loadModule = async () => {
  return await import("../../src/registry_config.js");
};

beforeEach(() => {
  files.clear();
  mtimes.clear();
  clock = 1;
  existsSync.mockClear();
  readFileSync.mockClear();
  writeFileSync.mockClear();
  mkdirSync.mockClear();
  vi.resetModules();
  delete process.env.SNAPSHOT_HANDLED_CHANGES;
});

describe("registry_config", () => {
  it("updates status and notes for scopes and keys", async () => {
    const cfg = await loadModule();
    cfg.setStatus("scope", "message", undefined, "process");
    cfg.setStatus("key", "message", "text", "ignore");
    cfg.setStatus("type", "message", "mention", "needs-review");
    cfg.setNote("scope", "message", undefined, "note");
    cfg.setNote("key", "message", "text", "key-note");
    cfg.setNote("type", "message", "mention", "type-note");

    const saved = JSON.parse(files.get(cfg.CONFIG_PATH) as string);
    expect(saved.scopes.message).toEqual({ status: "process", note: "note" });
    expect(saved.keys.message.text).toEqual({ status: "ignore", note: "key-note" });
    expect(saved.entityTypes.message.mention).toEqual({ status: "needs-review", note: "type-note" });
  });

  it("manages mode and storage policies", async () => {
    const cfg = await loadModule();
    cfg.setMode("debug");
    expect(cfg.getMode()).toBe("debug");
    cfg.setStoragePolicy("last-3");
    expect(cfg.getStoragePolicy()).toEqual({ handledChanges: "last-3" });

    process.env.SNAPSHOT_HANDLED_CHANGES = "off";
    expect(cfg.getStoragePolicy()).toEqual({ handledChanges: "off" });
  });

  it("resets defaults", async () => {
    const cfg = await loadModule();
    cfg.resetConfigDefaults();
    const saved = JSON.parse(files.get(cfg.CONFIG_PATH) as string);
    expect(saved.mode).toBe("dev");
    expect(saved.scopes.message.status).toBe("needs-review");
    expect(saved.keys.edited_message.edit_date.status).toBe("ignore");
  });
});
