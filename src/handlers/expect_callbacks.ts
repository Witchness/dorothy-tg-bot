import type { Context } from "grammy";
import { addExpectedPayloadKeys } from "../entity_registry.js";

export function createExpectPayloadCallbacksHandler<TCtx extends Context>() {
  return async function onExpectCallback(ctx: TCtx, next: () => Promise<void>) {
    const data = (ctx as any).callbackQuery?.data as string | undefined;
    if (!data || (!data.startsWith("exp|") && !data.startsWith("expall|"))) return next();
    const parts = data.split("|"); // exp|<label>|<key> OR expall|<label>|k1,k2
    try {
      if (parts[0] === "exp") {
        if (parts.length < 3) return next();
        const label = parts[1];
        const key = parts[2];
        const added = addExpectedPayloadKeys(label, [key]);
        await (ctx as any).answerCallbackQuery({ text: added.length ? `Додано: ${label}.${key}` : `Вже було: ${label}.${key}` });
      } else {
        if (parts.length < 3) return next();
        const label = parts[1];
        const keysCsv = parts[2] ?? "";
        const keys = keysCsv.split(",").map((s) => s.trim()).filter(Boolean);
        if (!keys.length) { await (ctx as any).answerCallbackQuery({ text: "Немає ключів" }); return; }
        const added = addExpectedPayloadKeys(label, keys);
        const addedText = added.length ? added.join(", ") : "нічого";
        await (ctx as any).answerCallbackQuery({ text: `Додано до ${label}: ${addedText}` });
      }
    } catch {
      try { await (ctx as any).answerCallbackQuery({ text: "Не вдалося додати", show_alert: true }); } catch {}
    }
  };
}
