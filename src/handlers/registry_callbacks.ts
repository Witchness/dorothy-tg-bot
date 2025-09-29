import type { Context } from "grammy";
import type { Status } from "../registry_status.js";

export interface ParsedRegAction {
  kind: "s" | "k" | "t";
  scope: string;
  name?: string;
  status: Status | "note";
}

export interface RegistryCallbacksDeps<TCtx extends Context> {
  parseRegCallback: (data: string) => ParsedRegAction | null;
  setStatus: (kind: "scope" | "key" | "type", scope: string, name: string | undefined, status: Status) => void;
  setNote: (kind: "scope" | "key" | "type", scope: string, name: string | undefined, note: string) => void;
  scheduleMarkdownRefresh?: () => void;
  statusRegistry: {
    getMode: () => "debug" | "dev" | "prod";
    snapshot: () => any;
    setScopeStatus: (scope: string, status: Status) => void;
    setMessageKeyStatus: (scope: string, key: string, status: Status) => void;
    setEntityTypeStatus: (scope: string, type: string, status: Status) => void;
  };
  buildInlineKeyboardForMessage: (
    scope: string,
    presentKeys: string[],
    presentTypes: string[],
    reg: any,
    mode: "debug" | "dev",
    samples?: Record<string, string>,
  ) => any;
}

export function createRegistryCallbacksHandler<TCtx extends Context>(deps: RegistryCallbacksDeps<TCtx>) {
  return async function registryCallbacksMiddleware(ctx: TCtx, next: () => Promise<void>) {
    const data = (ctx as any).callbackQuery?.data as string | undefined;
    if (!data || !data.startsWith("reg|")) return next();

    const parsed = deps.parseRegCallback(data);
    if (!parsed) return next();

    try {
      const mode = deps.statusRegistry.getMode();
      const msgText = ((ctx as any).callbackQuery?.message as any)?.text as string | undefined;

      // Extract currently presented keys/types from the message text
      const present = (() => {
        const res = { scope: parsed.scope, keys: [] as string[], types: [] as string[] };
        if (!msgText) return res;
        const scopeLine = /-\s*scope:\s*([a-z_]+)/i.exec(msgText);
        if (scopeLine) res.scope = scopeLine[1];
        const keysLine = /-\s*(?:нові\/[\p{L}]+\s+)?(?:message\.keys|keys):\s*([^\n]+)/iu.exec(msgText) || /-\s*(?:нові\/[\p{L}]+\s+)?keys:\s*([^\n]+)/iu.exec(msgText);
        if (keysLine) res.keys = keysLine[1].split(",").map((s) => s.trim()).filter(Boolean);
        const typesLine = /-\s*(?:нові\/[\p{L}]+\s+)?entity types:\s*([^\n]+)/iu.exec(msgText);
        if (typesLine) res.types = typesLine[1].split(",").map((s) => s.trim()).filter(Boolean);
        return res;
      })();

      if ((parsed as any).status === ("note" as any)) {
        (ctx as any).session = (ctx as any).session ?? {};
        (ctx as any).session.pendingNote = { kind: parsed.kind, scope: parsed.scope, name: parsed.name } as any;
        try { await (ctx as any).answerCallbackQuery(); } catch {}
        const label = parsed.kind === "s" ? parsed.scope : `${parsed.scope}.${parsed.name}`;
        await (ctx as any).reply(`Введіть нотатку для ${label} (або /cancel):`, { reply_to_message_id: (ctx as any).callbackQuery?.message?.message_id });
        return;
      }

      const status = parsed.status as Status;
      const label = parsed.kind === "s" ? parsed.scope : `${parsed.scope}.${parsed.name}`;
      const kindVerbose = parsed.kind === "s" ? "scope" : parsed.kind === "k" ? "key" : "type";

      deps.setStatus(kindVerbose as any, parsed.scope, parsed.name, status);
      if (parsed.kind === "s") {
        deps.statusRegistry.setScopeStatus(parsed.scope, status);
        if (status === "ignore") {
          const snap = deps.statusRegistry.snapshot();
          const keys = Object.keys(snap.keysByScope[parsed.scope] ?? {});
          for (const k of keys) deps.statusRegistry.setMessageKeyStatus(parsed.scope, k, "ignore");
          const types = Object.keys(snap.entityTypesByScope[parsed.scope] ?? {});
          for (const t of types) deps.statusRegistry.setEntityTypeStatus(parsed.scope, t, "ignore");
        }
      } else if (parsed.kind === "k" && parsed.name) {
        deps.statusRegistry.setMessageKeyStatus(parsed.scope, parsed.name, status);
      } else if (parsed.kind === "t" && parsed.name) {
        deps.statusRegistry.setEntityTypeStatus(parsed.scope, parsed.name, status);
      }

      // schedule markdown refresh (debounced) just like original index.ts
      try { deps.scheduleMarkdownRefresh?.(); } catch {}
      try { await (ctx as any).answerCallbackQuery({ text: `Updated: ${label} → ${status}` }); } catch {}

      // Try to update the inline keyboard in place to reflect new statuses
      try {
        let keys: string[] = present.keys.slice();
        let types: string[] = present.types.slice();
        if (parsed.kind === "s" && status === "ignore") {
          keys = [];
          types = [];
        }
        if (parsed.kind === "k" && parsed.name) {
          keys = keys.filter((k) => k !== parsed.name);
        } else if (parsed.kind === "t" && parsed.name) {
          types = types.filter((t) => t !== parsed.name);
        }
        if (!keys.length && !types.length) {
          const snap = deps.statusRegistry.snapshot();
          keys = Object.entries(snap.keysByScope[parsed.scope] ?? {})
            .filter(([, v]) => (v as any)?.status === "needs-review")
            .map(([k]) => k);
          types = Object.entries(snap.entityTypesByScope[parsed.scope] ?? {})
            .filter(([, v]) => (v as any)?.status === "needs-review")
            .map(([t]) => t);
        }
        {
          const snap = deps.statusRegistry.snapshot();
          keys = keys.filter((k) => (snap.keysByScope[parsed.scope]?.[k]?.status ?? "needs-review") === "needs-review");
          types = types.filter((t) => (snap.entityTypesByScope[parsed.scope]?.[t]?.status ?? "needs-review") === "needs-review");
        }
        const kb = deps.buildInlineKeyboardForMessage(parsed.scope, keys, types, deps.statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev");
        if (kb) await (ctx as any).editMessageReplyMarkup({ reply_markup: kb });
      } catch {
        // ignore UI update failures silently
      }
    } catch (e) {
      try { await (ctx as any).answerCallbackQuery({ text: "Failed to update status", show_alert: true }); } catch {}
    }
  };
}
