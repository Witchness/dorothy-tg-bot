import type { Context } from "grammy";
import type { RegistryStatus } from "../registry_status.js";
import { describeMessageKey } from "../humanize.js";
import { buildInlineKeyboardForMessage } from "../registry_actions.js";

export interface BusinessHandlersDeps<TCtx extends Context> {
  statusRegistry: RegistryStatus;
}

export function createBusinessMessageHandler<TCtx extends Context>(deps: BusinessHandlersDeps<TCtx>) {
  return async function onBusinessMessage(ctx: TCtx): Promise<void> {
    try {
      const mode = deps.statusRegistry.getMode();
      if (mode === "prod") return;
      const scopeStatusBm = deps.statusRegistry.getScopeStatus("business_message") ?? "needs-review";
      if (scopeStatusBm === "ignore") return;
      const msg = (ctx as any).businessMessage as Record<string, unknown>;
      if (!msg) return;
      const keys = Object.keys(msg).filter((k) => { const v = (msg as any)[k]; return v !== undefined && v !== null && typeof v !== "function"; });
      const types: string[] = [];
      const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
      const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
      for (const e of [...ents, ...cents]) { if (e && typeof (e as any).type === "string") types.push((e as any).type); }
      const uniqTypes = Array.from(new Set(types));

      const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
      deps.statusRegistry.observeMessageKeys("business_message", keys, samples);
      deps.statusRegistry.observeEntityTypes("business_message", uniqTypes);
      const kb = buildInlineKeyboardForMessage("business_message", keys, uniqTypes, deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);

      const summary = [
        "📣 Зафіксовано подію: business_message",
        `- scope: business_message [${scopeStatusBm}]`,
        keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await (ctx as any).reply(summary, { reply_to_message_id: (msg as any).message_id, reply_markup: kb ?? undefined });
    } catch (e) {
      console.warn("[status-registry] failed to post business_message event", e);
    }
  };
}

export function createEditedBusinessMessageHandler<TCtx extends Context>(deps: BusinessHandlersDeps<TCtx>) {
  return async function onEditedBusinessMessage(ctx: TCtx): Promise<void> {
    try {
      const mode = deps.statusRegistry.getMode();
      if (mode === "prod") return;
      const scopeStatusEbm = deps.statusRegistry.getScopeStatus("edited_business_message") ?? "needs-review";
      if (scopeStatusEbm === "ignore") return;
      const msg = (ctx as any).editedBusinessMessage as Record<string, unknown>;
      if (!msg) return;
      const keys = Object.keys(msg).filter((k) => { const v = (msg as any)[k]; return v !== undefined && v !== null && typeof v !== "function"; });
      const types: string[] = [];
      const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
      const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
      for (const e of [...ents, ...cents]) { if (e && typeof (e as any).type === "string") types.push((e as any).type); }
      const uniqTypes = Array.from(new Set(types));

      const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
      deps.statusRegistry.observeMessageKeys("edited_business_message", keys, samples);
      deps.statusRegistry.observeEntityTypes("edited_business_message", uniqTypes);
      const kb = buildInlineKeyboardForMessage("edited_business_message", keys, uniqTypes, deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);

      const summary = [
        "✏️ Зафіксовано редагування бізнес-повідомлення:",
        `- scope: edited_business_message [${scopeStatusEbm}]`,
        keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await (ctx as any).reply(summary, { reply_to_message_id: (msg as any).message_id, reply_markup: kb ?? undefined });
    } catch (e) {
      console.warn("[status-registry] failed to post edited_business_message event", e);
    }
  };
}
