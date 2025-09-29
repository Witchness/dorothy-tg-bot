import { beforeEach, describe, expect, it, vi, afterAll } from "vitest";

const files = new Map<string, string>();

const existsSync = vi.fn((path: string) => files.has(path));
const readFileSync = vi.fn((path: string) => {
  const value = files.get(path);
  if (value === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return value;
});
const writeFileSync = vi.fn((path: string, content: string) => { files.set(path, content); });
const mkdirSync = vi.fn();
const readdirSync = vi.fn(() => []);
const statSync = vi.fn((path: string) => ({ mtimeMs: 1 }));
const rmSync = vi.fn();

vi.mock("node:fs", () => ({ existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync }));
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { ...actual, resolve: (...segments: string[]) => segments.join("/") };
});
vi.mock("../../src/entity_registry.js", () => ({
  categorizeSampleLabel: (label: string) => (label.startsWith("api_") ? "handled" : "unknown" as const),
}));
vi.mock("../../src/registry_config.js", () => ({
  getStoragePolicy: () => ({ handledChanges: "all" as const }),
}));

const loadModule = async () => await import("../../src/unhandled_logger.js");

const envBackup = { ...process.env };

beforeEach(() => {
  files.clear();
  existsSync.mockClear();
  readFileSync.mockClear();
  writeFileSync.mockClear();
  mkdirSync.mockClear();
  readdirSync.mockClear();
  statSync.mockClear();
  rmSync.mockClear();
  vi.resetModules();
});

describe("unhandled_logger sanitization and signature limits", () => {
  it("depth=1: nested values are depth-truncated and shape is limited", async () => {
    // Tight limits, depth=1 forces '[truncated]' for nested fields
    process.env.SNAPSHOT_SAN_MAX_STRING = "10";
    process.env.SNAPSHOT_SAN_MAX_KEYS = "2";
    process.env.SNAPSHOT_SAN_MAX_ITEMS = "2";
    process.env.SNAPSHOT_SAN_MAX_DEPTH = "1";
    process.env.SNAPSHOT_SIGN_DEPTH = "1";
    process.env.SNAPSHOT_SIGN_MAX_KEYS = "2";
    process.env.SNAPSHOT_SIGN_MAX_ITEMS = "1";

    const logger = await loadModule();
    const payload = {
      long: "abcdefghijklmnop",
      nums: [1, 2, 3],
      obj: { a: { deep: true }, b: 2, c: 3 },
      text: "contact me at test@example.com",
    };

    const snap = logger.storeUnhandledSample("message", payload as any, Object.keys(payload));
    expect(snap).not.toBeNull();

    const written = Array.from(files.values())[0];
    const saved = JSON.parse(written);

    // depth-truncated markers for included keys (top-level keys are capped to 2)
    expect(saved.sample.long).toBe("[truncated]");
    expect(saved.sample.nums).toBe("[truncated]");
    // top-level object should include truncation marker
    expect(Object.keys(saved.sample)).toContain("…");

    expect(Array.isArray(saved.shape)).toBe(true);
    expect(saved.shape.length).toBeGreaterThan(0);
    expect(saved.shape.length).toBeLessThanOrEqual(10);
  });

  it("depth=2: sanitizes nested with ellipsis markers and array/object caps", async () => {
    // depth=2 allows processing nested values
    process.env.SNAPSHOT_SAN_MAX_STRING = "10";
    process.env.SNAPSHOT_SAN_MAX_KEYS = "2";
    process.env.SNAPSHOT_SAN_MAX_ITEMS = "2";
    process.env.SNAPSHOT_SAN_MAX_DEPTH = "2";
    process.env.SNAPSHOT_SIGN_DEPTH = "1";
    process.env.SNAPSHOT_SIGN_MAX_KEYS = "2";
    process.env.SNAPSHOT_SIGN_MAX_ITEMS = "1";

    vi.resetModules();
    const logger = await loadModule();
    const payload = {
      long: "abcdefghijklmnop",
      nums: [1, 2, 3],
      obj: { a: { deep: true }, b: 2, c: 3 },
      text: "contact me at test@example.com",
    };
    const snap = logger.storeUnhandledSample("message", payload as any, Object.keys(payload));
    expect(snap).not.toBeNull();

    const written = Array.from(files.values())[0];
    const saved = JSON.parse(written);

    // length truncation with ellipsis
    expect(saved.sample.long).toContain("… (truncated)");
    // arrays get truncated with a marker element
    expect(Array.isArray(saved.sample.nums)).toBe(true);
    expect(saved.sample.nums).toContain("…(truncated)");
    // top-level keys capped with '…' marker
    expect(Object.keys(saved.sample)).toContain("…");
  });
});

afterAll(() => {
  process.env = envBackup;
});