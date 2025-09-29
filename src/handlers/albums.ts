import { InlineKeyboard } from "grammy";
import type { QuoteRenderMode } from "../renderer.js";
import { renderMediaGroupHTML } from "../renderer.js";
import { analyzeMediaGroup, formatAnalysis } from "../analyzer.js";
import { drainMediaGroupEntry, type MediaGroupBufferEntry } from "../media_group_buffer.js";
import type { RegistryStatus } from "../registry_status.js";
import type { PresentPayload } from "../presenter_replay.js";
import {
  collectPresentPayloads,
  presentButtonLabelForKind,
  type PresentableMessage,
} from "../presenter/present_keyboard.js";

export interface AlbumHandlerDeps<TCtx> {
  statusRegistry: RegistryStatus;
  mediaGroupHoldMs: number;
  presentQuotesDefault: QuoteRenderMode;
  replySafe: (ctx: TCtx, text: string, opts?: Record<string, unknown>) => Promise<void>;
  registerPresentAction: (ctx: TCtx, payload: PresentPayload) => string;
  registerPresentBulk: (ctx: TCtx, items: PresentPayload[]) => string;
}

export const createAlbumHandler = <TCtx>(deps: AlbumHandlerDeps<TCtx>) => {
  const buffers = new Map<string, MediaGroupBufferEntry<TCtx>>();

  const flushMediaGroupBuffer = async (key: string) => {
    try {
      const buf = drainMediaGroupEntry(buffers, key);
      if (!buf) return;
      const items = buf.items as any[];
      const canText =
        deps.statusRegistry.getMessageKeyStatus("message", "text") === "process" ||
        deps.statusRegistry.getMessageKeyStatus("message", "caption") === "process";
      try { console.info(`[present] album start chat=${(buf as any).ctx?.chat?.id} items=${items.length}`); } catch {}

      const analysis = analyzeMediaGroup(items as any);
      const response = formatAnalysis(analysis);
      const previewLine = response.split("\n")[0] ?? "повідомлення";
      try {
        (buf.ctx as any).session.totalMessages += 1;
        (buf.ctx as any).session.history.push({ ts: Date.now(), preview: previewLine });
        if ((buf.ctx as any).session.history.length > 10) {
          (buf.ctx as any).session.history.splice(0, (buf.ctx as any).session.history.length - 10);
        }
      } catch {}
      const header = `Повідомлення #${(buf.ctx as any).session.totalMessages} у нашій розмові.`;
      const lastId = (items.at(-1) as any)?.message_id;

      // Presentation
      try {
        if ((buf.ctx as any).session?.presentMode) {
          const kb = new InlineKeyboard();
          let rows = 0;
          let index = 1;
          const allPayloads: PresentPayload[] = [];
          for (const m of items as any[]) {
            const payloads = collectPresentPayloads(m as PresentableMessage);
            const primary = payloads[0];
            if (primary) {
              allPayloads.push(primary);
              const labelBase = presentButtonLabelForKind(primary.kind);
              const actionId = deps.registerPresentAction(buf.ctx, primary);
              kb.text(`${labelBase} ${index}`, `present|${actionId}`).row();
              rows++;
            }
            index++;
          }
          if (allPayloads.length > 1) {
            const bulkId = deps.registerPresentBulk(buf.ctx, allPayloads);
            kb.text("📦 Надіслати всі", `presentall|${bulkId}`).row();
            rows++;
          }
          const { html } = renderMediaGroupHTML(items as any, ((buf.ctx as any).session.presentQuotes ?? deps.presentQuotesDefault));
          const cp = Array.from(html).length;
          try { console.info(`[present] album html len=${cp} rows=${rows} parse=${cp <= 3500}`); } catch {}
          if (cp > 0) {
            if (cp <= 3500) {
              try { await (buf.ctx as any).reply(html, { parse_mode: "HTML", reply_to_message_id: lastId, reply_markup: rows ? kb : undefined }); console.info(`[present] album html sent parse=true`); }
              catch (e) { console.warn(`[present] album html send failed, fallback text`, e); await deps.replySafe(buf.ctx, html, { reply_to_message_id: lastId, reply_markup: rows ? kb : undefined }); }
            } else {
              await deps.replySafe(buf.ctx, html, { reply_to_message_id: lastId, reply_markup: rows ? kb : undefined });
            }
          }
        }
      } catch {}

      if (canText) {
        await deps.replySafe(buf.ctx, `${header}\n${response}`, { reply_to_message_id: lastId });
      }

      if (analysis.alerts?.length) {
        const mode = deps.statusRegistry.getMode();
        if (mode !== "prod") {
          const payloadKeyRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
          const payloadShapeRe = /^New payload shape detected for\s+([^\s]+)\s*\(([^)]+)\)$/i;
          const lines: string[] = [];
          for (const a of analysis.alerts) {
            let m = a.match(payloadKeyRe);
            if (m) { lines.push(`- Нові ключі у ${m[1]}: ${m[2]}`); continue; }
            m = a.match(payloadShapeRe);
            if (m) { lines.push(`- Нова форма payload ${m[1]}: ${m[2]}`); continue; }
          }
          if (lines.length) {
            await deps.replySafe(buf.ctx, ["🔬 Вкладені payload-и (альбом):", ...lines].join("\n"), { reply_to_message_id: lastId });
          }
        }
      }
    } catch (e) {
      console.warn("[media-group] flush failed", e);
    }
  };

  const handle = (ctx: any): boolean => {
    const mgid = (ctx.message as any).media_group_id as string | undefined;
    if (!mgid) return false;
    const key = `${ctx.chat?.id}:${mgid}`;
    const present = buffers.get(key);
    if (present) {
      clearTimeout(present.timer);
      present.items.push(ctx.message);
      present.ctx = ctx;
      present.timer = setTimeout(() => void flushMediaGroupBuffer(key), deps.mediaGroupHoldMs);
    } else {
      const timer = setTimeout(() => void flushMediaGroupBuffer(key), deps.mediaGroupHoldMs);
      buffers.set(key, { ctx, items: [ctx.message], timer });
    }
    return true;
  };

  return { handle };
};