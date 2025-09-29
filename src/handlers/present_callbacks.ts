import type { Context } from "grammy";
import { DEFAULT_PRESENTALL_DELAY_MS, replayPresentPayloads, type PresentPayload } from "../presenter_replay.js";

export interface PresentActionEntry {
  chatId: number;
  userId: number;
  payload: PresentPayload;
  expire: number;
  timer: NodeJS.Timeout;
}

export interface PresentBulkEntry {
  chatId: number;
  userId: number;
  items: PresentPayload[];
  expire: number;
  timer: NodeJS.Timeout;
}

export interface PresentCallbacksDeps<TCtx extends Context> {
  presentActions: Map<string, PresentActionEntry>;
  presentBulkActions: Map<string, PresentBulkEntry>;
  delayMs?: number; // defaults to DEFAULT_PRESENTALL_DELAY_MS
}

// Middleware factory that handles present|<id> and presentall|<id> callback queries.
// Mirrors logic from index.ts lines ~692-753.
export function createPresentCallbacksHandler<TCtx extends Context>(deps: PresentCallbacksDeps<TCtx>) {
  const delay = Math.max(0, deps.delayMs ?? DEFAULT_PRESENTALL_DELAY_MS);

  return async function presentCallbacksMiddleware(ctx: TCtx, next: () => Promise<void>) {
    // Only handle callback_query with data
    const data = (ctx as any).callbackQuery?.data as string | undefined;
    if (!data || !(data.startsWith("present|") || data.startsWith("presentall|"))) {
      return next();
    }

    const [prefix, id] = data.split("|");
    if (!id) {
      try { await (ctx as any).answerCallbackQuery({ text: "Недійсно або прострочено", show_alert: true }); } catch {}
      return;
    }

    if (prefix === "presentall") {
      const bulk = deps.presentBulkActions.get(id);
      if (!bulk) {
        try { await (ctx as any).answerCallbackQuery({ text: "Недійсно або прострочено", show_alert: true }); } catch {}
        return;
      }
      if ((ctx as any).from?.id !== bulk.userId) {
        try { await (ctx as any).answerCallbackQuery({ text: "Не дозволено", show_alert: true }); } catch {}
        return;
      }
      try {
        await replayPresentPayloads(bulk.items, {
          photo: async (fileId) => { await (ctx as any).replyWithPhoto(fileId); },
          video: async (fileId) => { await (ctx as any).replyWithVideo(fileId); },
          document: async (fileId) => { await (ctx as any).replyWithDocument(fileId); },
          animation: async (fileId) => { await (ctx as any).replyWithAnimation(fileId); },
          audio: async (fileId) => { await (ctx as any).replyWithAudio(fileId); },
          voice: async (fileId) => { await (ctx as any).replyWithVoice(fileId); },
          video_note: async (fileId) => { await (ctx as any).replyWithVideoNote(fileId); },
          sticker: async (fileId) => { await (ctx as any).replyWithSticker(fileId); },
        }, { delayMs: delay });
        try { await (ctx as any).answerCallbackQuery(); } catch {}
      } catch (error) {
        try { await (ctx as any).answerCallbackQuery({ text: "Не вдалося надіслати всі", show_alert: true }); } catch {}
      } finally {
        try { clearTimeout(bulk.timer); } catch {}
        deps.presentBulkActions.delete(id);
      }
      return;
    }

    // Single present
    if (prefix === "present") {
      const entry = deps.presentActions.get(id);
      if (!entry) {
        try { await (ctx as any).answerCallbackQuery({ text: "Недійсно або прострочено", show_alert: true }); } catch {}
        return;
      }
      if ((ctx as any).from?.id !== entry.userId) {
        try { await (ctx as any).answerCallbackQuery({ text: "Не дозволено", show_alert: true }); } catch {}
        return;
      }
      try {
        const p = entry.payload;
        switch (p.kind) {
          case "photo": await (ctx as any).replyWithPhoto(p.file_id); break;
          case "video": await (ctx as any).replyWithVideo(p.file_id); break;
          case "document": await (ctx as any).replyWithDocument(p.file_id); break;
          case "animation": await (ctx as any).replyWithAnimation(p.file_id); break;
          case "audio": await (ctx as any).replyWithAudio(p.file_id); break;
          case "voice": await (ctx as any).replyWithVoice(p.file_id); break;
          case "video_note": await (ctx as any).replyWithVideoNote(p.file_id); break;
          case "sticker": await (ctx as any).replyWithSticker(p.file_id); break;
          default:
            try { await (ctx as any).answerCallbackQuery({ text: "Тип не підтримується", show_alert: true }); } catch {}
            return;
        }
        try { await (ctx as any).answerCallbackQuery(); } catch {}
      } catch (e) {
        try { await (ctx as any).answerCallbackQuery({ text: "Не вдалося надіслати", show_alert: true }); } catch {}
      } finally {
        try { clearTimeout(entry.timer); } catch {}
        deps.presentActions.delete(id);
      }
      return;
    }

    // Not our prefix → pass through
    return next();
  };
}
