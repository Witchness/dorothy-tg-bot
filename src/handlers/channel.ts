import type { Context } from "grammy";
import type { RegistryStatus } from "../registry_status.js";
import { describeMessageKey } from "../humanize.js";
import { buildInlineKeyboardForMessage } from "../registry_actions.js";

export interface ChannelHandlersDeps<TCtx extends Context> {
  statusRegistry: RegistryStatus;
}

export function createChannelPostHandler<TCtx extends Context>(deps: ChannelHandlersDeps<TCtx>) {
  return async function onChannelPost(ctx: TCtx): Promise<void> {
    try {
      const mode = deps.statusRegistry.getMode();
      if (mode === "prod") return;
      const scopeStatusCh = deps.statusRegistry.getScopeStatus("channel_post") ?? "needs-review";
      if (scopeStatusCh === "ignore") return;
      const msg = (ctx as any).channelPost as Record<string, unknown>;
      const keys = Object.keys(msg).filter((k) => {
        const v = (msg as any)[k];
        return v !== undefined && v !== null && typeof v !== "function";
      });
      const types: string[] = [];
      const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
      const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
      for (const e of [...ents, ...cents]) { if (e && typeof (e as any).type === "string") types.push((e as any).type); }
      const uniqTypes = Array.from(new Set(types));

      const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
      deps.statusRegistry.observeMessageKeys("channel_post", keys, samples);
      deps.statusRegistry.observeEntityTypes("channel_post", uniqTypes);

      const kb = buildInlineKeyboardForMessage("channel_post", keys, uniqTypes, deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);

      const summary = [
        "📣 Зафіксовано подію: channel_post",
        `- scope: channel_post [${scopeStatusCh}]`,
        keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await (ctx as any).reply(summary, { reply_to_message_id: (ctx as any).channelPost.message_id, reply_markup: kb ?? undefined });
    } catch (e) {
      console.warn("[status-registry] failed to post channel_post event", e);
    }
  };
}

export function createEditedChannelPostHandler<TCtx extends Context>(deps: ChannelHandlersDeps<TCtx>) {
  return async function onEditedChannelPost(ctx: TCtx): Promise<void> {
    try {
      const mode = deps.statusRegistry.getMode();
      if (mode === "prod") return;
      const scopeStatusEch = deps.statusRegistry.getScopeStatus("edited_channel_post") ?? "needs-review";
      if (scopeStatusEch === "ignore") return;
      const msg = (ctx as any).editedChannelPost as Record<string, unknown>;
      const keys = Object.keys(msg).filter((k) => {
        const v = (msg as any)[k];
        return v !== undefined && v !== null && typeof v !== "function";
      });
      const types: string[] = [];
      const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
      const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
      for (const e of [...ents, ...cents]) { if (e && typeof (e as any).type === "string") types.push((e as any).type); }
      const uniqTypes = Array.from(new Set(types));

      const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
      deps.statusRegistry.observeMessageKeys("edited_channel_post", keys, samples);
      deps.statusRegistry.observeEntityTypes("edited_channel_post", uniqTypes);

      const kb = buildInlineKeyboardForMessage("edited_channel_post", keys, uniqTypes, deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);

      const summary = [
        "✏️ Зафіксовано редагування каналу:",
        `- scope: edited_channel_post [${scopeStatusEch}]`,
        keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await (ctx as any).reply(summary, { reply_to_message_id: (ctx as any).editedChannelPost.message_id, reply_markup: kb ?? undefined });
    } catch (e) {
      console.warn("[status-registry] failed to post edited_channel_post event", e);
    }
  };
}
