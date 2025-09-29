import type { Context } from "grammy";
import type { RegistryStatus } from "../registry_status.js";
import { buildRegistryMarkdown } from "../report.js";
import { writeFileAtomic } from "../utils/safe_fs.js";
import { describeMessageKey } from "../humanize.js";
import { buildInlineKeyboardForMessage } from "../registry_actions.js";

export interface EditedHandlerDeps<TCtx extends Context> {
  statusRegistry: RegistryStatus;
}

export function createEditedMessageHandler<TCtx extends Context>(deps: EditedHandlerDeps<TCtx>) {
  return async function onEditedMessage(ctx: TCtx): Promise<void> {
    try {
      const mode = deps.statusRegistry.getMode();
      if (mode === "prod") return; // silent in prod
      const scopeStatus = deps.statusRegistry.getScopeStatus("edited_message") ?? "needs-review";
      if (scopeStatus === "ignore") return;

      const msg = (ctx as any).editedMessage as Record<string, unknown>;
      const keys = Object.keys(msg).filter((k) => {
        const v = (msg as any)[k];
        return v !== undefined && v !== null && typeof v !== "function";
      });
      const types: string[] = [];
      const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
      const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
      for (const e of [...ents, ...cents]) { if (e && typeof (e as any).type === "string") types.push((e as any).type); }
      const uniqTypes = Array.from(new Set(types));

      const samples: Record<string, string> = {};
      for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }

      const keyDiff = keys.length ? deps.statusRegistry.observeMessageKeys("edited_message", keys, samples) : [];
      const typeDiff = uniqTypes.length ? deps.statusRegistry.observeEntityTypes("edited_message", uniqTypes) : [];

      // Always post an event summary in debug/dev
      const kb = buildInlineKeyboardForMessage("edited_message", keys, uniqTypes, deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
      const scopeStatusEm = deps.statusRegistry.getScopeStatus("edited_message") ?? "needs-review";
      const summary = [
        "✏️ Зафіксовано редагування повідомлення:",
        `- scope: edited_message [${scopeStatusEm}]`,
        keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
        uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      await (ctx as any).reply(summary, { reply_to_message_id: (ctx as any).editedMessage.message_id, reply_markup: kb ?? undefined });

      // If there are new keys/types, add an extra diff block
      if ((keyDiff && keyDiff.length) || (typeDiff && typeDiff.length)) {
        const lines: string[] = [];
        if (keyDiff.length) {
          lines.push("Нові ключі у edited_message:");
          for (const k of keyDiff) lines.push(`- ${k.key}: ${k.status}${(k as any).sample ? "; приклад: " + (k as any).sample : ""}`);
        }
        if (typeDiff.length) {
          if (lines.length) lines.push("");
          lines.push("Нові типи ентіті у edited_message:");
          for (const t of typeDiff) lines.push(`- ${t.type}: ${t.status}`);
        }
        const text = lines.join("\n");
        const hint = "\n\nℹ️ Повний реєстр: /registry";
        await (ctx as any).reply(text + hint, { reply_to_message_id: (ctx as any).editedMessage.message_id });
        const mdPath = "data/entity-registry.md";
        const md = buildRegistryMarkdown(deps.statusRegistry.snapshot());
        writeFileAtomic(mdPath, md);
      }
    } catch (e) {
      console.warn("[status-registry] failed to post edited_message event", e);
    }
  };
}
