import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { createPersistenceService } from "../../src/persistence/service.js";

const sampleMessage = (over: Partial<any> = {}) => ({
  message_id: 201,
  date: Math.floor(Date.now() / 1000),
  chat: { id: 888, type: "private" },
  from: { id: 666, first_name: "B" },
  text: "fail",
  ...over,
});

const buildPathBuilder = (dataDir: string) => ({ userId, messageId }: any) => {
  const abs = join(dataDir, "messages", String(userId), String(messageId));
  const rel = ["data", "messages", String(userId), String(messageId)].join("/");
  return { abs, rel };
};

describe("persistence/service failure", () => {
  it("returns ok=false and triggers fail reaction if repo throws", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "tg-bot-fail-"));
    try {
      const repo = {
        upsertUser: () => 1,
        upsertChat: () => 1,
        insertMessage: () => { throw new Error("db write failed"); },
        insertAttachment: () => 1,
        insertEvent: () => {},
        insertError: () => {},
      } as any;
      let replied = "";
      const reactions = {
        ok: () => {},
        fail: async (ctx: any) => { await ctx.reply("❌"); },
      } as any;
      const downloader = { downloadTo: async () => { throw new Error("not used"); } } as any;
      const service = createPersistenceService({ repo, pathBuilder: buildPathBuilder(workdir), reactions, fileDownloader: downloader });
      const ctx: any = { chat: { id: 888 }, message: { message_id: 201 }, reply: async (t: string) => { replied = t; } };
      const res = await service.saveMessage(ctx, sampleMessage());
      expect(res.ok).toBe(false);
      expect(replied).toBe("❌");
    } finally {
      try { rmSync(workdir, { recursive: true, force: true }); } catch {}
    }
  });
});