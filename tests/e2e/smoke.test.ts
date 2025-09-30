import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersistenceService } from "../../src/persistence/service.js";

const buildPathBuilder = (dataDir: string) => ({ userId, messageId }: any) => {
  const abs = join(dataDir, "messages", String(userId), String(messageId));
  const rel = ["data", "messages", String(userId), String(messageId)].join("/");
  return { abs, rel };
};

const reactions = { ok: () => {}, fail: () => {} } as any;

const textMessage = (over: Partial<any> = {}) => ({
  message_id: 301,
  date: Math.floor(Date.now() / 1000),
  chat: { id: 900, type: "private" },
  from: { id: 901, first_name: "T" },
  text: "hello world",
  ...over,
});

const photoMessage = (over: Partial<any> = {}) => ({
  message_id: 302,
  date: Math.floor(Date.now() / 1000),
  chat: { id: 900, type: "private" },
  from: { id: 901, first_name: "T" },
  caption: "cat",
  photo: [
    { file_id: "small", width: 1, height: 1 },
    { file_id: "large", width: 100, height: 100 },
  ],
  ...over,
});

describe("e2e smoke (persistence)", () => {
  let workdir: string;
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "tg-bot-e2e-"));
  });
  afterEach(() => {
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  });

  it("persists text message (json only)", async () => {
    const downloader = { downloadTo: async () => { throw new Error("not used for text"); } } as any;
    const repo = {
      upsertUser: () => 1,
      upsertChat: () => 1,
      insertMessage: () => 1,
      insertAttachment: () => 1,
      insertEvent: () => {},
      insertError: () => {},
    } as any;
    const service = createPersistenceService({ repo, pathBuilder: buildPathBuilder(workdir), reactions, fileDownloader: downloader });
    const ctx: any = { chat: { id: 900 }, message: { message_id: 301 } };
    const res = await service.saveMessage(ctx, textMessage());
    expect(res.ok).toBe(true);
    const jsonPath = join(workdir, "messages", "901", "301", "messages.json");
    expect(existsSync(jsonPath)).toBe(true);
    const obj = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(obj.text).toBe("hello world");
  });

  it("persists photo message and downloads best-size photo", async () => {
    const downloader = {
      downloadTo: async (_fileId: string, destAbsPath: string) => {
        // write a small file to destAbsPath
        writeFileSync(destAbsPath, Buffer.from("img"));
        return { localPath: destAbsPath, mime: "image/jpeg", size: 3 };
      }
    } as any;
    let lastAttachment: any = null;
    const repo = {
      upsertUser: () => 1,
      upsertChat: () => 1,
      insertMessage: () => 2,
      insertAttachment: (a: any) => { lastAttachment = a; return 1; },
      insertEvent: () => {},
      insertError: () => {},
    } as any;
    const service = createPersistenceService({ repo, pathBuilder: buildPathBuilder(workdir), reactions, fileDownloader: downloader });
    const ctx: any = { chat: { id: 900 }, message: { message_id: 302 } };
    const res = await service.saveMessage(ctx, photoMessage());
    expect(res.ok).toBe(true);
    const expectedFile = join(workdir, "messages", "901", "302", "photo_302.jpg");
    expect(existsSync(expectedFile)).toBe(true);
    expect(lastAttachment?.file_name).toBe("photo_302.jpg");
    expect(lastAttachment?.mime).toBe("image/jpeg");
  });
});