import { beforeEach, describe, expect, it, vi } from "vitest";

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

const loadModule = async () => await import("../../src/unhandled_logger.js");

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

describe("unhandled_logger edge cases", () => {
  it("handles invalid existing API error file gracefully", async () => {
    const logger = await loadModule();
    const apiErrorPath = `${process.cwd()}/data/api-errors/api_error_sendMessage.json`;
    files.set(apiErrorPath, "{invalid-json}");
    // existsSync will return true and JSON.parse will throw in module under test
    logger.storeApiError("sendMessage", { text: "hi" }, { description: "Bad", error_code: 400 });
    expect(writeFileSync).toHaveBeenCalled();
    const written = Array.from(files.entries()).find(([k]) => k.includes("api-errors"))![1];
    const parsed = JSON.parse(written);
    expect(parsed.method).toBe("sendMessage");
    expect(Array.isArray(parsed.errors)).toBe(true);
  });
});