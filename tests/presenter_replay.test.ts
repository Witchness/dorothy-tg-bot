import { describe, expect, it } from "vitest";
import { DEFAULT_PRESENTALL_DELAY_MS, replayPresentPayloads } from "../src/presenter_replay.js";

describe("replayPresentPayloads", () => {
  it("invokes senders sequentially with delay", async () => {
    const calls: string[] = [];
    const senders = {
      photo: async (fileId: string) => { calls.push(`photo:${fileId}`); },
      video: async (fileId: string) => { calls.push(`video:${fileId}`); },
      document: async (fileId: string) => { calls.push(`document:${fileId}`); },
      animation: async (fileId: string) => { calls.push(`animation:${fileId}`); },
      audio: async (fileId: string) => { calls.push(`audio:${fileId}`); },
      voice: async (fileId: string) => { calls.push(`voice:${fileId}`); },
      video_note: async (fileId: string) => { calls.push(`video_note:${fileId}`); },
      sticker: async (fileId: string) => { calls.push(`sticker:${fileId}`); },
    };
    const slept: number[] = [];
    await replayPresentPayloads(
      [
        { kind: "photo", file_id: "p1" },
        { kind: "video", file_id: "v1" },
      ],
      senders,
      { delayMs: 10, sleep: async (ms) => { slept.push(ms); } },
    );
    expect(calls).toEqual(["photo:p1", "video:v1"]);
    expect(slept).toEqual([10]);
  });

  it("skips delay when only a single payload", async () => {
    const calls: string[] = [];
    const senders = {
      photo: async (fileId: string) => { calls.push(`photo:${fileId}`); },
      video: async () => { throw new Error("unused"); },
      document: async () => { throw new Error("unused"); },
      animation: async () => { throw new Error("unused"); },
      audio: async () => { throw new Error("unused"); },
      voice: async () => { throw new Error("unused"); },
      video_note: async () => { throw new Error("unused"); },
      sticker: async () => { throw new Error("unused"); },
    };
    const slept: number[] = [];
    await replayPresentPayloads(
      [{ kind: "photo", file_id: "one" }],
      senders,
      { delayMs: DEFAULT_PRESENTALL_DELAY_MS, sleep: async (ms) => { slept.push(ms); } },
    );
    expect(calls).toEqual(["photo:one"]);
    expect(slept).toEqual([]);
  });

  it("throws when sender missing", async () => {
    const senders = {
      photo: async () => {},
      video: async () => {},
      document: async () => {},
      animation: async () => {},
      audio: async () => {},
      voice: async () => {},
      video_note: async () => {},
      sticker: async () => {},
    };
    await expect(replayPresentPayloads([
      { kind: "unsupported" as any, file_id: "x" },
    ], senders)).rejects.toThrow(/Unsupported presenter payload kind/);
  });
});
