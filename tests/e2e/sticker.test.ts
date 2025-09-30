import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersistenceService } from "../../src/persistence/service.js";

const buildPathBuilder = (dataDir: string) => ({ userId, messageId }: any) => {
  const abs = join(dataDir, "messages", String(userId), String(messageId));
  const rel = ["data", "messages", String(userId), String(messageId)].join("/");
  return { abs, rel };
};

const reactions = { ok: () => {}, fail: () => {} } as any;

const stickerMessage = (over: Partial<any> = {}) => ({
  message_id: 401,
  date: Math.floor(Date.now() / 1000),
  chat: { id: 950, type: "private" },
  from: { id: 951, first_name: "S" },
  sticker: {
    file_id: "st_file",
    file_unique_id: "uniq",
    width: 128,
    height: 128,
    is_animated: false,
    is_video: false,
  },
  ...over,
});

describe("e2e sticker (persistence)", () => {
  let workdir: string;
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "tg-bot-sticker-"));
  });
  afterEach(() => {
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  });

  it("persists static sticker as .webp", async () => {
    const downloader = {
      downloadTo: async (_fileId: string, destAbsPath: string) => {
        writeFileSync(destAbsPath, Buffer.from("webp"));
        return { localPath: destAbsPath, mime: "image/webp", size: 4 };
      }
    } as any;
    let lastAttachment: any = null;
    const repo = {
      upsertUser: () => 1,
      upsertChat: () => 1,
      insertMessage: () => 5,
      insertAttachment: (a: any) => { lastAttachment = a; return 1; },
      insertEvent: () => {},
      insertError: () => {},
    } as any;
    const service = createPersistenceService({ repo, pathBuilder: buildPathBuilder(workdir), reactions, fileDownloader: downloader });
    const ctx: any = { chat: { id: 950 }, message: { message_id: 401 } };
    const msg = stickerMessage();
    const res = await service.saveMessage(ctx, msg);
    expect(res.ok).toBe(true);
    const expectedFile = join(workdir, "messages", "951", "401", "sticker_401.webp");
    expect(existsSync(expectedFile)).toBe(true);
    expect(lastAttachment?.file_name).toBe("sticker_401.webp");
    expect(lastAttachment?.mime).toBe("image/webp");
  });
});