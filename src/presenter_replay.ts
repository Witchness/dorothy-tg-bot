export type PresentKind =
  | "photo"
  | "video"
  | "document"
  | "animation"
  | "audio"
  | "voice"
  | "video_note"
  | "sticker";

export interface PresentPayload {
  kind: PresentKind;
  file_id: string;
}

export type PresentSenderMap = {
  [K in PresentKind]: (fileId: string) => Promise<void>;
};

export interface ReplayOptions {
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const DEFAULT_PRESENTALL_DELAY_MS = 350;

export const replayPresentPayloads = async (
  items: PresentPayload[],
  senders: PresentSenderMap,
  options: ReplayOptions = {},
): Promise<void> => {
  if (!items.length) return;
  const delay = Math.max(0, options.delayMs ?? DEFAULT_PRESENTALL_DELAY_MS);
  const sleep = options.sleep ?? defaultSleep;
  for (let index = 0; index < items.length; index += 1) {
    const payload = items[index];
    const handler = senders[payload.kind];
    if (!handler) {
      throw new Error(`Unsupported presenter payload kind: ${payload.kind}`);
    }
    await handler(payload.file_id);
    if (delay > 0 && index < items.length - 1) {
      await sleep(delay);
    }
  }
};
