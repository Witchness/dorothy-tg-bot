import { describe, expect, it, vi } from "vitest";
import { replySafe, sendSafeMessage } from "../../src/utils/safe_messaging.js";

describe("replySafe", () => {
  it("splits long replies into 4096-char chunks", async () => {
    const calls: Array<{ text: string; options?: Record<string, unknown> }> = [];
    const reply = vi.fn(async (text: string, options?: Record<string, unknown>) => {
      calls.push({ text, options });
    });

    await replySafe(reply, "a".repeat(4096 * 2 + 10), { reply_to_message_id: 123 });

    expect(calls).toHaveLength(3);
    expect(calls.every(({ text }) => text.length <= 4096)).toBe(true);
    expect(calls[0]?.options?.reply_to_message_id).toBe(123);
    expect(calls[1]?.options?.reply_to_message_id).toBeUndefined();
    expect(calls[2]?.options?.reply_to_message_id).toBeUndefined();
  });

  it("forces link previews off for each chunk", async () => {
    const calls: Array<Record<string, unknown> | undefined> = [];
    const reply = vi.fn(async (_text: string, options?: Record<string, unknown>) => {
      calls.push(options);
    });

    await replySafe(reply, "hello world", {});

    expect(calls).toHaveLength(1);
    expect(calls[0]?.link_preview_options).toMatchObject({ is_disabled: true });
  });

  it("short-circuits blank input", async () => {
    const reply = vi.fn();
    await replySafe(reply, "   \n\t  ");
    expect(reply).not.toHaveBeenCalled();
  });

  it("retries when the first send throws", async () => {
    const reply = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockResolvedValue(undefined);

    await replySafe(reply, "retry me");

    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[1]?.[1]).toEqual({ link_preview_options: { is_disabled: true } });
  });
});

describe("sendSafeMessage", () => {
  it("splits long messages and drops reply_to_message_id on subsequent chunks", async () => {
    const calls: Array<{ chatId: number | string; text: string; options?: Record<string, unknown> }> = [];
    const sendMessage = vi.fn(async (chatId: number | string, text: string, options?: Record<string, unknown>) => {
      calls.push({ chatId, text, options });
    });

    await sendSafeMessage(sendMessage, 42, "b".repeat(4096 + 5), { reply_to_message_id: 999, disable_notification: true });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.text.length).toBe(4096);
    expect(calls[1]?.text.length).toBe(5);
    expect(calls[0]?.options).toMatchObject({ reply_to_message_id: 999, disable_notification: true });
    expect(calls[1]?.options).not.toHaveProperty("reply_to_message_id");
  });

  it("short-circuits blank input", async () => {
    const sendMessage = vi.fn();
    await sendSafeMessage(sendMessage, 1, "\n\t");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
