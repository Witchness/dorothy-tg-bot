import type { Context } from "grammy";
import type { RegistryStatus } from "../registry_status.js";
import type { QuoteRenderMode } from "../renderer.js";
import { renderMessageHTML } from "../renderer.js";
import { analyzeMessage, formatAnalysis } from "../analyzer.js";
import { buildInlineKeyboardForMessage, buildInlineKeyboardForNestedPayload } from "../registry_actions.js";
import type { PresentPayload } from "../presenter_replay.js";
import { buildPresentKeyboardForMessage, type PresentableMessage } from "../presenter/present_keyboard.js";

export interface MessageAlbumsLike<TCtx> { handle: (ctx: TCtx) => boolean }

export interface MessageHandlerDeps<TCtx extends Context> {
  statusRegistry: RegistryStatus;
  albums: MessageAlbumsLike<TCtx>;
  presentQuotesDefault: QuoteRenderMode;
  replySafe: (ctx: TCtx, text: string, opts?: Record<string, unknown>) => Promise<void>;
  registerPresentAction: (ctx: TCtx, payload: PresentPayload) => string;
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
      if (mode !== "prod") {
        const kb = buildInlineKeyboardForMessage("message", keys, Array.from(new Set(types)), deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
        const text = [
          "🔒 Цей scope ще не дозволено для обробки:",
          `- scope: message [${scopeStatus}]`,
          keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        ].join("\n");
        await (ctx as any).reply(text, { reply_to_message_id: (ctx as any).message?.message_id, reply_markup: kb ?? undefined });
      }
      return;
    }

    // Scope is processed: show pending items in dev/debug
    const pendingKeys = keys.filter((k) => (deps.statusRegistry.getMessageKeyStatus("message", k) ?? "needs-review") === "needs-review");
    const pendingTypes = Array.from(new Set(types)).filter((t) => (deps.statusRegistry.getEntityTypeStatus("message", t) ?? "needs-review") === "needs-review");
    if (mode !== "prod" && (pendingKeys.length || pendingTypes.length)) {
      const kb = buildInlineKeyboardForMessage(
        "message",
        pendingKeys.length ? pendingKeys : [],
        pendingTypes.length ? pendingTypes : [],
        deps.statusRegistry.snapshot(),
        mode === "debug" ? "debug" : "dev",
        samples,
      );
      const text = [
        "🧰 Налаштувати обробку ключів для цього повідомлення:",
        pendingKeys.length ? `- нові/необроблені keys: ${pendingKeys.join(", ")}` : "- keys: всі дозволені",
        pendingTypes.length ? `- нові/необроблені entity types: ${pendingTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await (ctx as any).reply(text, { reply_to_message_id: (ctx as any).message?.message_id, reply_markup: kb ?? undefined });
    }

    // Only analyze if text/caption is allowed
    const canText = (deps.statusRegistry.getMessageKeyStatus("message", "text") === "process") || (deps.statusRegistry.getMessageKeyStatus("message", "caption") === "process");

    // Media group aggregation handled by albums
    if (deps.albums.handle(ctx as any)) {
      return;
    }

    // Presentation (HTML), independent of canText
    try {
      if (((ctx as any).session as any)?.presentMode) {
        try {
          const m: any = (ctx as any).message;
          const kb = buildPresentKeyboardForMessage(m as PresentableMessage, (payload) => deps.registerPresentAction(ctx, payload));
          const { html } = renderMessageHTML(m, (((ctx as any).session.presentQuotes ?? deps.presentQuotesDefault)) as QuoteRenderMode);
          const cp = Array.from(html).length;
          if (cp > 0) {
            if (cp <= 3500) {
              try { await (ctx as any).reply(html, { parse_mode: "HTML", reply_to_message_id: m.message_id, reply_markup: kb ?? undefined }); }
              catch (e) { await deps.replySafe(ctx, html, { reply_to_message_id: m.message_id, reply_markup: kb ?? undefined }); }
            } else {
              await deps.replySafe(ctx, html, { reply_to_message_id: m.message_id, reply_markup: kb ?? undefined });
            }
          }
        } catch {}
      }
    } catch {}

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
      await deps.replySafe(ctx, `${header}\n${response}`);
    }

    // Alerts (nested payload keyboards)
    if (canText && (lastAnalysis as any)?.alerts?.length) {
      const analysis = lastAnalysis!;
      if ((analysis as any).alerts?.length) {
        const mode = deps.statusRegistry.getMode();
        if (mode === "prod") return;
        const payloadKeyRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
        const payloadShapeRe = /^New payload shape detected for\s+([^\s]+)\s*\(([^)]+)\)$/i;
        const lines: string[] = [];
        const nested: Array<{ label: string; keys: string[] }> = [];
        for (const a of (analysis as any).alerts) {
          let m = (a as string).match(payloadKeyRe);
          if (m) {
            const label = m[1];
            const keysStr = m[2];
            const arr = keysStr.split(",").map((s: string) => s.trim()).filter(Boolean);
            lines.push(`- Нові ключі у ${label}: ${arr.join(", ")}`);
            nested.push({ label, keys: arr });
            continue;
          }
          m = (a as string).match(payloadShapeRe);
          if (m) {
            const label = m[1];
            const sig = m[2];
            lines.push(`- Нова форма payload ${label}: ${sig}`);
            continue;
          }
        }
        if (lines.length) {
          const regSnap = deps.statusRegistry.snapshot();
          const kb = nested.length ? buildInlineKeyboardForNestedPayload(nested[0].label, nested[0].keys, regSnap) : null;
          await deps.replySafe(ctx, ["🔬 Вкладені payload-и:", ...lines].join("\n"), { reply_to_message_id: (ctx as any).message?.message_id, reply_markup: kb ?? undefined });
        }
      }
    }
  };
}
