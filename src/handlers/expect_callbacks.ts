import type { Context } from "grammy";
import { addExpectedPayloadKeys } from "../entity_registry.js";
import { appendSchemaRequest } from "../admin/schema_requests_queue.js";

export function createExpectPayloadCallbacksHandler<TCtx extends Context>(deps?: { onAddExpected?: (label: string, keys: string[], ctx: TCtx) => Promise<void> | void }) {
  return async function onExpectCallback(ctx: TCtx, next: () => Promise<void>) {
    const data = (ctx as any).callbackQuery?.data as string | undefined;
    if (!data || (!data.startsWith("exp|") && !data.startsWith("expall|") && !data.startsWith("rq|"))) return next();
    const parts = data.split("|"); // exp|<label>|<key> OR expall|<label>|k1,k2
    try {
      if (parts[0] === "exp") {
        if (parts.length < 3) return next();
        const label = parts[1];
        const key = parts[2];
        const added = addExpectedPayloadKeys(label, [key]);
        try { await deps?.onAddExpected?.(label, [key], ctx); } catch {}
        await (ctx as any).answerCallbackQuery({ text: added.length ? `Додано: ${label}.${key}` : `Вже було: ${label}.${key}` });
      } else if (parts[0] === "expall") {
        if (parts.length < 3) return next();
        const label = parts[1];
        const keysCsv = parts[2] ?? "";
        const keys = keysCsv.split(",").map((s) => s.trim()).filter(Boolean);
        if (!keys.length) { await (ctx as any).answerCallbackQuery({ text: "Немає ключів" }); return; }
        const added = addExpectedPayloadKeys(label, keys);
        try { await deps?.onAddExpected?.(label, keys, ctx); } catch {}
        const addedText = added.length ? added.join(", ") : "нічого";
        await (ctx as any).answerCallbackQuery({ text: `Додано до ${label}: ${addedText}` });
      } else if (parts[0] === "rq") {
        if (parts.length < 3) return next();
        const label = parts[1];
        const keysCsv = parts[2] ?? "";
        const keys = keysCsv.split(",").map((s) => s.trim()).filter(Boolean);
        try {
          appendSchemaRequest({ label, keys, requested_by: (ctx as any)?.from?.id ?? null });
          await (ctx as any).answerCallbackQuery({ text: `Записано у JSON (${keys.length})` });
        } catch {
          await (ctx as any).answerCallbackQuery({ text: "Не вдалося записати у JSON", show_alert: true });
        }
      }
    } catch {
      try { await (ctx as any).answerCallbackQuery({ text: "Не вдалося додати", show_alert: true }); } catch {}
    }
  };
}
