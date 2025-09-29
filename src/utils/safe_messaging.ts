import { splitForTelegram, toValidUnicode } from "../text_utils.js";

export type ReplyCallback = (
  text: string,
  options?: Record<string, unknown>,
) => Promise<unknown> | unknown;

export type SendMessageCallback = (
  chatId: number | string,
  text: string,
  options?: Record<string, unknown>,
) => Promise<unknown> | unknown;

const buildLinkPreviewOptions = (options?: Record<string, unknown>) => {
  const merged = { ...(options ?? {}) } as Record<string, unknown>;
  const preview = (merged.link_preview_options as Record<string, unknown> | undefined) ?? {};
  merged.link_preview_options = { is_disabled: true, ...preview };
  return merged;
};

export const replySafe = async (
  reply: ReplyCallback,
  text: string,
  options?: Record<string, unknown>,
): Promise<void> => {
  const safe = toValidUnicode(text);
  if (!safe || safe.trim().length === 0) return;
  const chunks = splitForTelegram(safe, 4096);
  let first = true;
  for (const chunk of chunks) {
    if (!chunk) continue;
    try {
      const base = first ? options : undefined;
      const merged = buildLinkPreviewOptions(base);
      await reply(chunk, merged);
    } catch (error) {
      try {
        await reply(chunk, { link_preview_options: { is_disabled: true } });
      } catch (fallbackError) {
        console.warn("[replySafe] failed to send chunk", fallbackError);
      }
    }
    first = false;
  }
};

export const sendSafeMessage = async (
  sendMessage: SendMessageCallback,
  chatId: number | string,
  text: string,
  options?: Record<string, unknown>,
): Promise<void> => {
  const safe = toValidUnicode(text);
  if (!safe || safe.trim().length === 0) return;
  const chunks = splitForTelegram(safe, 4096);
  let first = true;
  for (const chunk of chunks) {
    if (!chunk) continue;
    const base = { ...(options ?? {}) } as Record<string, unknown>;
    if (!first && "reply_to_message_id" in base) {
      delete (base as Record<string, unknown>).reply_to_message_id;
    }
    await sendMessage(chatId, chunk, base);
    first = false;
  }
};
