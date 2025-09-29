import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
let tick = 1;

const setFile = (path: string, content: string) => {
  files.set(path, content);
  tick += 1;
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
const readdirSync = vi.fn((dir: string) => {
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  return Array.from(files.keys())
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
});
const statSync = vi.fn((path: string) => ({ mtimeMs: tick }));
const rmSync = vi.fn((path: string) => { files.delete(path); });

const getStoragePolicy = vi.fn(() => ({ handledChanges: "all" as const }));
const categorizeSampleLabel = vi.fn((label: string) => (label.startsWith("api_") ? "handled" : "unknown"));

vi.mock("node:fs", () => ({ existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync }));
vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { ...actual, resolve: (...segments: string[]) => segments.join("/") };
});
vi.mock("../../src/registry_config.js", () => ({ getStoragePolicy }));
vi.mock("../../src/entity_registry.js", () => ({ categorizeSampleLabel }));

const loadModule = async () => await import("../../src/unhandled_logger.js");

beforeEach(() => {
  files.clear();
  tick = 1;
  existsSync.mockClear();
  readFileSync.mockClear();
  writeFileSync.mockClear();
  mkdirSync.mockClear();
  readdirSync.mockClear();
  statSync.mockClear();
  rmSync.mockClear();
  getStoragePolicy.mockClear();
  categorizeSampleLabel.mockClear();
  vi.resetModules();
});

describe("unhandled_logger", () => {
  it("stores sanitized snapshots and deduplicates", async () => {
    const logger = await loadModule();
    const snapshot = logger.storeUnhandledSample("message", { text: "hello", email: "user@test.com" }, ["text"]);
    expect(snapshot).not.toBeNull();
    expect(writeFileSync).toHaveBeenCalled();
    const filePath = snapshot!.filePath;
    const saved = JSON.parse(files.get(filePath) as string);
    expect(saved.sample.email).toBe("[email]");

    // duplicate should be ignored
    const again = logger.storeUnhandledSample("message", { text: "hello" }, ["text"]);
    expect(again).not.toBeNull();
  });

  it("respects handled storage policy", async () => {
    getStoragePolicy.mockReturnValueOnce({ handledChanges: "off" });
    categorizeSampleLabel.mockReturnValueOnce("handled");
    const logger = await loadModule();
    const snapshot = logger.storeUnhandledSample("message", { text: "hi" }, ["text"]);
    expect(snapshot).toBeNull();
  });

  it("stores API samples and errors", async () => {
    const logger = await loadModule();
    const apiSnapshot = logger.storeApiSample("sendMessage", { ok: true, result: { chat_id: 1 } }, ["ok", "result"]);
    expect(apiSnapshot).not.toBeNull();

    logger.storeApiError("sendMessage", { text: "hi" }, { description: "Bad Request", error_code: 400 });
    const errorFile = Array.from(files.entries()).find(([path]) => path.includes("api-errors"));
    expect(errorFile).toBeTruthy();
    const parsed = JSON.parse(errorFile![1]);
    expect(parsed.errors[0].description).toBe("Bad Request");
  });

  it("prunes handled snapshots when limit reached", async () => {
    getStoragePolicy.mockReturnValue({ handledChanges: "last-3" });
    categorizeSampleLabel.mockReturnValue("handled");
    const logger = await loadModule();
    for (let i = 0; i < 5; i += 1) {
      logger.storeUnhandledSample("message", { text: `msg${i}` }, ["text"], { category: "handled" });
    }
    const handledDir = `${process.cwd()}/data/handled-changes`;
    const handledFiles = Array.from(files.keys()).filter((key) => key.startsWith(`${handledDir}/`));
    expect(handledFiles.length).toBeLessThanOrEqual(3);
  });
});
