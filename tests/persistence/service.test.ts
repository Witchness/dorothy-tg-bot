import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { createPersistenceService } from "../../src/persistence/service.js";

// Minimal repo stub
const createRepoStub = () => {
  const users: any[] = [];
  const chats: any[] = [];
  const messages: any[] = [];
  const attachments: any[] = [];
  const errors: any[] = [];
  let userId = 0, chatId = 0, messageId = 0, attachmentId = 0;
  return {
    upsertUser(u: any) {
      const found = users.find((x) => x.tg_id === u.tg_id);
      if (found) return found.id;
      const id = ++userId; users.push({ id, ...u }); return id;
    },
    upsertChat(c: any) {
      const found = chats.find((x) => x.tg_id === c.tg_id);
      if (found) return found.id;
      const id = ++chatId; chats.push({ id, ...c }); return id;
    },
    insertMessage(m: any) { const id = ++messageId; messages.push({ id, ...m }); return id; },
    insertAttachment(a: any) { const id = ++attachmentId; attachments.push({ id, ...a }); return id; },
    insertEvent() {},
    insertError(scope: string, err: unknown, context?: unknown, msgId?: number | null) { errors.push({ scope, err, context, msgId }); },
    _state: { users, chats, messages, attachments, errors },
  } as any;
};

// No-op reactions
const reactions = { ok: () => {}, fail: () => {} } as any;

// No-op downloader (we'll pass files explicitly)
const downloader = { downloadTo: async () => { throw new Error("not used in test"); } } as any;

const buildPathBuilder = (dataDir: string) => ({ userId, messageId }: any) => {
  const abs = join(dataDir, "messages", String(userId), String(messageId));
  const rel = ["data", "messages", String(userId), String(messageId)].join("/");
  // ensure dirs via service write
  return { abs, rel };
};

const sampleMessage = (over: Partial<any> = {}) => ({
  message_id: 101,
  date: Math.floor(Date.now() / 1000),
  chat: { id: 777, type: "private" },
  from: { id: 555, first_name: "A" },
  text: "hello",
  ...over,
});

describe("persistence/service", () => {
  let workdir: string;
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "tg-bot-test-"));
  });
  afterEach(() => {
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  });

  it("saves message json and records rows without attachments", async () => {
    const repo = createRepoStub();
    const service = createPersistenceService({
      repo,
      pathBuilder: buildPathBuilder(workdir),
      reactions,
      fileDownloader: downloader,
    });
    const ctx: any = { chat: { id: 777 }, message: { message_id: 101 } };
    const msg = sampleMessage();
    const res = await service.saveMessage(ctx, msg);
    expect(res.ok).toBe(true);

    // FS
    const jsonPath = join(workdir, "messages", "555", "101", "messages.json");
    expect(existsSync(jsonPath)).toBe(true);
    const content = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(content.text).toBe("hello");

    // Repo
    expect(repo._state.users.length).toBe(1);
    expect(repo._state.chats.length).toBe(1);
    expect(repo._state.messages.length).toBe(1);
    expect(repo._state.attachments.length).toBe(0);
  });

  it("persists provided attachments metadata", async () => {
    const repo = createRepoStub();
    const service = createPersistenceService({
      repo,
      pathBuilder: buildPathBuilder(workdir),
      reactions,
      fileDownloader: downloader,
    });
    const ctx: any = { chat: { id: 777 }, message: { message_id: 102 } };
    const msg = sampleMessage({ message_id: 102, text: undefined, caption: "photo" });
    const fileAbs = join(workdir, "messages", "555", "102", "photo_102.jpg");
    // Pre-create parent folders and file content via write inside service only; we only pass metadata so path remains relative check
    const res = await service.saveMessage(ctx, msg, [{ localPath: fileAbs, mime: "image/jpeg", size: 123, kind: "photo", tgFileId: "abc", suggestedName: "photo_102.jpg" }]);
    expect(res.ok).toBe(true);
    expect(repo._state.attachments.length).toBe(1);
    const a = repo._state.attachments[0];
    expect(a.mime).toBe("image/jpeg");
    expect(a.kind).toBe("photo");
    // Path stored POSIX-like (data/...)
    expect(a.path.includes("\\")).toBe(false);
  });
});