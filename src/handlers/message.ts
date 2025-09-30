import type { Context } from "grammy";
import type { RegistryStatus } from "../registry_status.js";
import type { QuoteRenderMode } from "../renderer.js";
import { renderMessageHTML } from "../renderer.js";
import { analyzeMessage, formatAnalysis } from "../analyzer.js";
import { buildInlineKeyboardForMessage, buildInlineKeyboardForNestedPayload } from "../registry_actions.js";
import { InlineKeyboard } from "grammy";
import type { PresentPayload } from "../presenter_replay.js";
import { buildPresentKeyboardForMessage, type PresentableMessage } from "../presenter/present_keyboard.js";
import type { SaveResult } from "../persistence/service.js";

export interface MessageAlbumsLike<TCtx> { handle: (ctx: TCtx) => boolean }

export interface MessageHandlerDeps<TCtx extends Context> {
  statusRegistry: RegistryStatus;
  albums: MessageAlbumsLike<TCtx>;
  presentQuotesDefault: QuoteRenderMode;
  replySafe: (ctx: TCtx, text: string, opts?: Record<string, unknown>) => Promise<void>;
  registerPresentAction: (ctx: TCtx, payload: PresentPayload) => string;
  // Optional persistence
  persistence?: { saveMessage: (ctx: TCtx, message: unknown) => Promise<SaveResult> };
  persistEnabled?: boolean;
  notifyFailure?: (ctx: TCtx, err: unknown) => Promise<void> | void;
  debugSink?: (ctx: TCtx, text: string, opts?: Record<string, unknown>) => Promise<void>;
}

export function createMessageHandler<TCtx extends Context>(deps: MessageHandlerDeps<TCtx>) {
  const isCommandMessage = (ctx: any): boolean => {
    const text = ctx.message?.text as string | undefined;
    if (!text) return false;
    const entities = ctx.message?.entities ?? [];
    if (!entities.length) return text.startsWith("/");
    return entities.some((entity: any) => entity.type === "bot_command" && entity.offset === 0);
  };

  return async function onMessage(ctx: TCtx, next: () => Promise<void>): Promise<void> {
    if (isCommandMessage(ctx)) return next();

    const mode = deps.statusRegistry.getMode();
    const msgRec = (ctx as any).message as Record<string, unknown>;
    const keys = Object.keys(msgRec).filter((k) => {
      const v = (msgRec as any)[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const types: string[] = [];
    const ents = Array.isArray((msgRec as any).entities) ? (msgRec as any).entities : [];
    const cents = Array.isArray((msgRec as any).caption_entities) ? (msgRec as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof (e as any).type === "string") types.push((e as any).type); }

    // Update registry for seen keys/types
    const samples: Record<string, string> = {}; for (const k of keys) samples[k] = JSON.stringify((msgRec as any)[k]);
    deps.statusRegistry.observeMessageKeys("message", keys, samples);
    deps.statusRegistry.observeEntityTypes("message", Array.from(new Set(types)));

    // Gate by scope
    const scopeStatus = deps.statusRegistry.getScopeStatus("message") ?? "needs-review";
    if (scopeStatus === "ignore") return;
if (scopeStatus !== "process") {
      if (mode === "debug" && deps.debugSink) {
        const kb = buildInlineKeyboardForMessage("message", keys, Array.from(new Set(types)), deps.statusRegistry.snapshot(), "debug", samples);
        const text = [
          "🔒 Цей scope ще не дозволено для обробки:",
          `- scope: message [${scopeStatus}]`,
          keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        ].join("\n");
        await deps.debugSink(ctx, text, { reply_markup: kb ?? undefined });
      }
      return;
    }

    // Scope is processed: show pending items in dev/debug
    const pendingKeys = keys.filter((k) => (deps.statusRegistry.getMessageKeyStatus("message", k) ?? "needs-review") === "needs-review");
    const pendingTypes = Array.from(new Set(types)).filter((t) => (deps.statusRegistry.getEntityTypeStatus("message", t) ?? "needs-review") === "needs-review");
if (mode === "debug" && (pendingKeys.length || pendingTypes.length) && deps.debugSink) {
      const kb = buildInlineKeyboardForMessage(
        "message",
        pendingKeys.length ? pendingKeys : [],
        pendingTypes.length ? pendingTypes : [],
        deps.statusRegistry.snapshot(),
        "debug",
        samples,
      );
      const text = [
        "🧰 Налаштувати обробку ключів для цього повідомлення:",
        pendingKeys.length ? `- нові/необроблені keys: ${pendingKeys.join(", ")}` : "- keys: всі дозволені",
        pendingTypes.length ? `- нові/необроблені entity types: ${pendingTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await deps.debugSink(ctx, text, { reply_markup: kb ?? undefined });
    }

    // Only analyze if text/caption is allowed
    const canText = (deps.statusRegistry.getMessageKeyStatus("message", "text") === "process") || (deps.statusRegistry.getMessageKeyStatus("message", "caption") === "process");

    // Media group aggregation handled by albums
    if (deps.albums.handle(ctx as any)) {
      return;
    }

    // Persist the message BEFORE any gating returns
    if (deps.persistence && deps.persistEnabled) {
      try {
        const res = await deps.persistence.saveMessage(ctx as any, (ctx as any).message);
        if (!res.ok) {
          try { await deps.notifyFailure?.(ctx, (res as any).error ?? new Error("unknown")); } catch {}
        }
      } catch (e) {
        try { await deps.notifyFailure?.(ctx, e); } catch {}
      }
    }

    // Presentation (HTML) — route to admin in debug mode only
    if (((ctx as any).session as any)?.presentMode && mode === "debug" && deps.debugSink) {
      try {
        const m: any = (ctx as any).message;
        const kb = buildPresentKeyboardForMessage(m as PresentableMessage, (payload) => deps.registerPresentAction(ctx, payload));
        const { html } = renderMessageHTML(m, (((ctx as any).session.presentQuotes ?? deps.presentQuotesDefault)) as QuoteRenderMode);
        if (Array.from(html).length > 0) {
          await deps.debugSink(ctx, html, { parse_mode: "HTML", reply_markup: kb ?? undefined } as any);
        }
      } catch {}
    }

    // Analysis
    let lastAnalysis: ReturnType<typeof analyzeMessage> | null = null;
    if (canText) {
      const analysis = analyzeMessage((ctx as any).message);
      lastAnalysis = analysis;
      const response = formatAnalysis(analysis);
      const previewLine = response.split("\n")[0] ?? "повідомлення";
      try {
        (ctx as any).session.totalMessages += 1;
        (ctx as any).session.history.push({ ts: Date.now(), preview: previewLine });
        if ((ctx as any).session.history.length > 10) {
          (ctx as any).session.history.splice(0, (ctx as any).session.history.length - 10);
        }
      } catch {}
const header = `Повідомлення #${(ctx as any).session.totalMessages} у нашій розмові.`;
      // PROD: завжди відправляємо аналіз адміну
      // DEBUG: також відправляємо
      if ((mode === "debug" || mode === "prod") && deps.debugSink) {
        await deps.debugSink(ctx, `${header}\n${response}`);
      }
    }

    // Alerts (nested payload keyboards)
    if (canText && (lastAnalysis as any)?.alerts?.length) {
      const analysis = lastAnalysis!;
      if ((analysis as any).alerts?.length) {
        const mode = deps.statusRegistry.getMode();
        // PROD: відправляємо інфо про нові поля адміну (без кнопок "додати")
        // DEBUG: те саме + кнопки інтерактивні
        const { buildAlertDetail } = await import("../utils/alert_details.js");
        const lines: string[] = [];
        const nested: Array<{ label: string; keys: string[] }> = [];
        const payloadKeysRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
        for (const a of (analysis as any).alerts) {
          if (!payloadKeysRe.test(a as string)) continue; // Variant A: only new-keys alerts in chat
          const detail = buildAlertDetail(a as string, (ctx as any).message);
          if (detail) {
            lines.push(`- ${detail.header}`);
            for (const l of detail.lines) lines.push(`  • ${l}`);
            const m1 = (a as string).match(payloadKeysRe);
            if (m1) {
              const label = m1[1];
              const arr = m1[2].split(",").map((s: string) => s.trim()).filter(Boolean);
              nested.push({ label, keys: arr });
            }
          }
        }
if (lines.length && (mode === "debug" || mode === "prod") && deps.debugSink) {
          const regSnap = deps.statusRegistry.snapshot();
          const kb = nested.length ? buildInlineKeyboardForNestedPayload(nested[0].label, nested[0].keys, regSnap) : null;
          await deps.debugSink(ctx, ["🔬 Вкладені payload-и:", ...lines].join("\n"), { reply_markup: kb ?? undefined });
          // Extra: offer to add expected keys via buttons (only in debug)
          if (mode === "debug" && nested.length && nested[0].keys.length) {
            const addKb = new InlineKeyboard();
            const label = nested[0].label;
            const keys = nested[0].keys;
            for (const key of keys) {
              addKb.text(`➕ ${key}`, `exp|${label}|${key}`).row();
            }
            const bulkData = `expall|${label}|${keys.join(',')}`;
            if (bulkData.length <= 64 && keys.length > 1) addKb.text("➕ Додати всі", bulkData).row();
            const saveAllData = `rq|${label}|${keys.join(',')}`;
            if (saveAllData.length <= 64) addKb.text("🗒 Зберегти всі в JSON", saveAllData).row();
            await deps.debugSink(ctx, "Додати ключі до очікуваних:", { reply_markup: addKb });
          }
        }
      }
    }
  };
}
