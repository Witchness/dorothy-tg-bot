import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Import after setting env so module picks up the path

describe("admin/schema_requests_queue", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "schema-queue-"));
    file = join(dir, "schema-requests.jsonl");
    process.env.SCHEMA_REQUESTS_PATH = file;
    // dynamic import to pick up env at import time
    const mod = await import("../../src/admin/schema_requests_queue.js");
    (global as any).__queue = mod;
  });
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
    delete process.env.SCHEMA_REQUESTS_PATH;
    delete (global as any).__queue;
  });

  it("appends JSON line with label/keys/requested_by", async () => {
    const { appendSchemaRequest } = (global as any).__queue as typeof import("../../src/admin/schema_requests_queue.js");
    appendSchemaRequest({ label: "payload:message.photo", keys: ["sizes", "width"], requested_by: 123 });
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf8").trim();
    const lines = content.split(/\r?\n/);
    expect(lines.length).toBe(1);
    const obj = JSON.parse(lines[0]);
    expect(obj.label).toBe("payload:message.photo");
    expect(obj.keys).toEqual(["sizes", "width"]);
    expect(obj.requested_by).toBe(123);
    expect(typeof obj.ts).toBe("string");
  });
});