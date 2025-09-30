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
import type { SaveResult } from "../persistence/service.js";

export interface AlbumHandlerDeps<TCtx> {
  statusRegistry: RegistryStatus;
  mediaGroupHoldMs: number;
  presentQuotesDefault: QuoteRenderMode;
  replySafe: (ctx: TCtx, text: string, opts?: Record<string, unknown>) => Promise<void>;
  registerPresentAction: (ctx: TCtx, payload: PresentPayload) => string;
  registerPresentBulk: (ctx: TCtx, items: PresentPayload[]) => string;
  // Optional persistence
  persistence?: { saveMessage: (ctx: TCtx, message: unknown) => Promise<{ ok: boolean }> };
  notifyFailure?: (ctx: TCtx, err: unknown) => Promise<void> | void;
  persistEnabled?: boolean;
  // Optional debug sink: send debug/dev outputs to admin chat
  debugSink?: (ctx: TCtx, text: string, opts?: Record<string, unknown>) => Promise<void>;
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

      // Send analysis to admin in debug mode and prod mode
      const currentMode = deps.statusRegistry.getMode();
      if (canText && (currentMode === "debug" || currentMode === "prod") && (deps as any).debugSink) {
        await (deps as any).debugSink(buf.ctx, `${header}\n${response}`);
      }

      // Persistence (enabled via env flag): save each message in the album individually
      try {
        if (deps.persistence && deps.persistEnabled) {
          for (const m of items) {
            try {
              const res = await deps.persistence.saveMessage(buf.ctx as any, m);
              if (!res.ok) { try { await deps.notifyFailure?.(buf.ctx as any, new Error("persistence failed")); } catch {} }
            } catch (e) {
              try { await deps.notifyFailure?.(buf.ctx as any, e); } catch {}
            }
          }
        }
      } catch {}

      // Alerts in debug and prod mode (buttons only in debug)
      const alertMode = deps.statusRegistry.getMode();
      if (analysis.alerts?.length && (alertMode === "debug" || alertMode === "prod") && (deps as any).debugSink) {
        const { buildAlertDetail } = await import("../utils/alert_details.js");
        const lines: string[] = [];
        const payloadKeysRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
        const nested: Array<{ label: string; keys: string[] }> = [];
        for (const a of analysis.alerts) {
          if (!payloadKeysRe.test(a)) continue;
          const detail = buildAlertDetail(a, (buf.ctx as any).message ?? {});
          if (detail) {
            lines.push(`- ${detail.header}`);
            for (const l of detail.lines) lines.push(`  • ${l}`);
            const m1 = a.match(payloadKeysRe);
            if (m1) {
              const label = m1[1];
              const arr = m1[2].split(",").map((s: string) => s.trim()).filter(Boolean);
              nested.push({ label, keys: arr });
            }
          }
        }
        if (lines.length) {
          await (deps as any).debugSink(buf.ctx, ["🔬 Вкладені payload-и (альбом):", ...lines].join("\n"));
          // Buttons only in debug
          if (alertMode === "debug" && nested.length && nested[0].keys.length) {
            const addKb = new (await import("grammy")).InlineKeyboard();
            const label = nested[0].label;
            const keys = nested[0].keys;
            for (const key of keys) addKb.text(`➕ ${key}`, `exp|${label}|${key}`).row();
            const bulkData = `expall|${label}|${keys.join(',')}`;
            if (bulkData.length <= 64 && keys.length > 1) addKb.text("➕ Додати всі", bulkData).row();
            const saveAllData = `rq|${label}|${keys.join(',')}`;
            if (saveAllData.length <= 64) addKb.text("🗒 Зберегти всі в JSON", saveAllData).row();
            await (deps as any).debugSink(buf.ctx, "Додати ключі до очікуваних:", { reply_markup: addKb });
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