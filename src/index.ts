import { Bot, Context, GrammyError, SessionFlavor, session, InputFile } from "grammy";
import "dotenv/config";
import { MINIMAL_UPDATES_9_2 } from "./constants.js";
import { analyzeMessage, formatAnalysis } from "./analyzer.js";
import {
  recordApiShape,
  recordCallbackKeys,
  recordInlineQueryKeys,
  recordPayloadKeys,
  recordUpdateKeys,
} from "./entity_registry.js";
import { storeApiError, storeApiSample, storeUnhandledSample } from "./unhandled_logger.js";
import { RegistryStatus } from "./registry_status.js";
import { formatDiffReport } from "./notifier.js";
import { buildRegistryMarkdown } from "./report.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface HistoryEntry {
  ts: number;
  preview: string;
}

interface SessionData {
  history: HistoryEntry[];
}

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN is missing. Add it to your .env file.");
  process.exit(1);
}

const allowlist = new Set(
  (process.env.ALLOWLIST_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

const toRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const adminChatId = process.env.ADMIN_CHAT_ID?.trim();

const bot = new Bot<MyContext>(token);

const statusRegistry = new RegistryStatus();

const ensureDirFor = (filePath: string) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

bot.catch((err) => {
  console.error("Unhandled bot error", err.error);
});

const notifyAdmin = async (message: string) => {
  if (!adminChatId) return;
  try {
    await bot.api.sendMessage(adminChatId, message);
  } catch (error) {
    console.warn("[alerts] Failed to notify admin", error);
  }
};

bot.api.config.use(async (prev, method, payload, signal) => {
  try {
    const result = await prev(method, payload, signal);
    try {
      const newKeys = recordApiShape(method, result);
      const apiSnapshot = storeApiSample(method, result, newKeys);
      if (newKeys.length) {
        void notifyAdmin(`New API response keys for ${method}: ${newKeys.join(", ")}`);
      } else if (apiSnapshot) {
        void notifyAdmin(`New API response variant for ${method} (${apiSnapshot.signature})`);
      }
    } catch (error) {
      console.warn("[registry] Не вдалося зафіксувати форму відповіді API", error);
    }
    return result;
  } catch (error) {
    if (error instanceof GrammyError) {
      try {
        storeApiError(method, payload, error);
      } catch (logError) {
        console.warn("[api-error] Failed to store API error", logError);
      }
      void notifyAdmin(`[error] API ${method}: ${error.description ?? error.message ?? "unknown"}`);
    }
    throw error;
  }
});

bot.use(session<SessionData, MyContext>({
  initial: () => ({ history: [] }),
}));

bot.use(async (ctx, next) => {
  const updateRecord = toRecord(ctx.update);
  const keys = Object.keys(updateRecord).filter((key) => key !== "update_id");
  if (keys.length) {
    const newUpdateKeys = recordUpdateKeys(keys);
    const updateSnapshot = storeUnhandledSample("update", updateRecord, newUpdateKeys);
    if (newUpdateKeys.length) {
      void notifyAdmin(`New update keys observed: ${newUpdateKeys.join(", ")}`);
      // Also reflect in status registry and reply in chat if possible
      try {
        const scopes = statusRegistry.observeScopes(newUpdateKeys);
        const text = formatDiffReport({ newScopes: scopes });
        if (text) {
          const hint = "\n\nℹ️ Повний реєстр: /registry";
          const replyTo = (ctx as any).message?.message_id ?? (ctx as any).editedMessage?.message_id;
          if (replyTo) {
            await ctx.reply(text + hint, { reply_to_message_id: replyTo });
          }
          // Refresh Markdown snapshot
          const mdPath = "data/entity-registry.md";
          const md = buildRegistryMarkdown(statusRegistry.snapshot());
          ensureDirFor(mdPath);
          writeFileSync(mdPath, md, "utf8");
        }
      } catch (e) {
        console.warn("[status-registry] failed to reply scopes diff", e);
      }
    } else if (updateSnapshot) {
      void notifyAdmin(`New update shape captured: update (${updateSnapshot.signature})`);
    }

    for (const key of keys) {
      const payload = updateRecord[key];
      if (!payload || typeof payload !== "object") continue;
      const payloadRecord = toRecord(payload);
      const payloadKeys = Object.keys(payloadRecord).filter((field) => {
        const value = payloadRecord[field];
        if (typeof value === "function") return false;
        return value !== undefined && value !== null;
      });
      if (!payloadKeys.length) continue;
      const newPayloadKeys = recordPayloadKeys(`update.${key}`, payloadKeys);
      if (!Array.isArray(payload)) {
        const payloadSnapshot = storeUnhandledSample(`update.${key}`, payloadRecord, newPayloadKeys);
        if (newPayloadKeys.length) {
          void notifyAdmin(`New payload keys for update.${key}: ${newPayloadKeys.join(", ")}`);
        } else if (payloadSnapshot) {
          void notifyAdmin(`New payload shape captured: update.${key} (${payloadSnapshot.signature})`);
        }
      }
    }
  }
  await next();
});

bot.use(async (ctx, next) => {
  const uid = ctx.from?.id?.toString();
  if (allowlist.size && (!uid || !allowlist.has(uid))) return;
  await next();
});

const isCommandMessage = (ctx: MyContext) => {
  const text = ctx.message?.text;
  if (!text) return false;
  const entities = ctx.message.entities ?? [];
  if (!entities.length) return text.startsWith("/");
  return entities.some((entity) => entity.type === "bot_command" && entity.offset === 0);
};

bot.command("history", async (ctx) => {
  const entries = ctx.session.history.slice(-5);
  if (!entries.length) {
    await ctx.reply("Історія поки порожня.");
    return;
  }

  const formatted = entries
    .map((entry, index) => {
      const date = new Date(entry.ts).toLocaleString("uk-UA", { hour12: false });
      return `${index + 1}. ${date} — ${entry.preview}`;
    })
    .join("\n");

  await ctx.reply(`Останні ${entries.length} записів:\n${formatted}`);
});

bot.on("message", async (ctx) => {
  if (isCommandMessage(ctx)) return;

  const analysis = analyzeMessage(ctx.message);
  const response = formatAnalysis(analysis);

  const previewLine = response.split("\n")[0] ?? "повідомлення";
  const entry: HistoryEntry = { ts: Date.now(), preview: previewLine };
  ctx.session.history.push(entry);
  if (ctx.session.history.length > 10) {
    ctx.session.history.splice(0, ctx.session.history.length - 10);
  }

  const header = `Повідомлення #${ctx.session.history.length} у нашій розмові.`;
  await ctx.reply(`${header}\n${response}`);

  // If analyzer detected new message keys / entity types, surface a concise status reply
  try {
    const alerts = analysis.alerts ?? [];
    const newKeys: string[] = [];
    const newTypes: string[] = [];
    for (const line of alerts) {
      if (line.startsWith("New message keys observed:")) {
        const list = line.split(":")[1]?.trim() ?? "";
        for (const k of list.split(",").map((s) => s.trim()).filter(Boolean)) newKeys.push(k);
      }
      if (line.startsWith("New entity type observed:")) {
        const type = line.split(":")[1]?.trim();
        if (type) newTypes.push(type);
      }
    }

    // Build friendly samples for some common keys
    const samples: Record<string, string> = {};
    const msgRec = ctx.message as unknown as Record<string, unknown>;
    const shorten = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + "…" : s);
    if (newKeys.includes("photo") && Array.isArray((msgRec as any).photo)) {
      const arr = (msgRec as any).photo as any[];
      let maxW = 0, maxH = 0;
      for (const p of arr) { const w = Number(p?.width ?? 0); const h = Number(p?.height ?? 0); if (w * h > maxW * maxH) { maxW = w; maxH = h; } }
      samples["photo"] = `Photo: x${arr.length}, max=${maxW}x${maxH}`;
    }
    if (newKeys.includes("sticker") && (msgRec as any).sticker) {
      const s = (msgRec as any).sticker as any;
      const t = s?.type || (s?.is_video ? "video" : s?.is_animated ? "animated" : "regular");
      const emoji = s?.emoji ? `, emoji=${s.emoji}` : "";
      samples["sticker"] = `Sticker: type=${t}${emoji}`;
    }
    if (newKeys.includes("contact") && (msgRec as any).contact) {
      const c = (msgRec as any).contact as any;
      const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
      const phone: string | undefined = c?.phone_number;
      const mask = (p?: string) => {
        if (!p) return undefined; const sign = p.startsWith("+") ? "+" : ""; const digits = p.replace(/[^\d]/g, "");
        if (digits.length <= 4) return sign + digits; const head = digits.slice(0, 2); const tail = digits.slice(-2);
        return `${sign}${head}${"*".repeat(Math.max(0, digits.length - 4))}${tail}`; };
      const masked = mask(phone);
      samples["contact"] = `Contact: ${name || "—"}${masked ? ", phone=" + masked : ""}`;
    }
    if (newKeys.includes("poll") && (msgRec as any).poll) {
      const p = (msgRec as any).poll as any;
      const q = p?.question ? JSON.stringify(shorten(String(p.question), 60)) : '"(no question)"';
      const opts = Array.isArray(p?.options) ? p.options.length : 0;
      const anon = p?.is_anonymous === false ? "non-anonymous" : "anonymous";
      samples["poll"] = `Poll: question=${q}, options=${opts}, ${anon}`;
    }

    const scopesDiff = undefined;
    const keyDiff = newKeys.length ? statusRegistry.observeMessageKeys(newKeys, samples) : [];
    const typeDiff = newTypes.length ? statusRegistry.observeEntityTypes(newTypes) : [];
    if ((keyDiff && keyDiff.length) || (typeDiff && typeDiff.length)) {
      const text = formatDiffReport({ newMessageKeys: keyDiff, newEntityTypes: typeDiff });
      if (text) {
        const hint = "\n\nℹ️ Повний реєстр: /registry";
        await ctx.reply(text + hint, { reply_to_message_id: ctx.message.message_id });
        const mdPath = "data/entity-registry.md";
        const md = buildRegistryMarkdown(statusRegistry.snapshot());
        ensureDirFor(mdPath);
        writeFileSync(mdPath, md, "utf8");
      }
    }
  } catch (e) {
    console.warn("[status-registry] failed to reply message diff", e);
  }

  if (analysis.alerts?.length) {
    void notifyAdmin(analysis.alerts.map((line) => `Alert (${ctx.chat?.id ?? "unknown"}): ${line}`).join("\n"));
  }
});

bot.on("callback_query", async (ctx) => {
  const payload = ctx.callbackQuery;
  const newKeys = recordCallbackKeys(Object.keys(payload));
  const callbackSnapshot = storeUnhandledSample("callback_query", toRecord(payload), newKeys);
  if (newKeys.length) {
    void notifyAdmin(`New callback_query keys: ${newKeys.join(", ")}`);
  } else if (callbackSnapshot) {
    void notifyAdmin(`New callback_query shape captured (${callbackSnapshot.signature})`);
  }

  if (payload.message) {
    const messageRecord = toRecord(payload.message);
    const messageKeys = recordPayloadKeys("callback_query.message", Object.keys(messageRecord));
    const messageSnapshot = storeUnhandledSample("callback_query.message", messageRecord, messageKeys);
    if (messageKeys.length) {
      void notifyAdmin(`New callback_query.message keys: ${messageKeys.join(", ")}`);
    } else if (messageSnapshot) {
      void notifyAdmin(`New callback_query.message shape captured (${messageSnapshot.signature})`);
    }
  }

  await ctx.answerCallbackQuery();
});

bot.on("inline_query", async (ctx) => {
  const newKeys = recordInlineQueryKeys(Object.keys(ctx.inlineQuery));
  const inlineSnapshot = storeUnhandledSample("inline_query", toRecord(ctx.inlineQuery), newKeys);
  if (newKeys.length) {
    void notifyAdmin(`New inline_query keys: ${newKeys.join(", ")}`);
  } else if (inlineSnapshot) {
    void notifyAdmin(`New inline_query shape captured (${inlineSnapshot.signature})`);
  }
  await ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
});

async function main() {
  const mode = (process.env.MODE ?? "polling").toLowerCase();

  if (mode === "polling") {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.info("Starting bot in polling mode...");
    await bot.start({ allowed_updates: MINIMAL_UPDATES_9_2 });
    return;
  }

  console.error("Webhook mode is not configured in this template. Set MODE=polling to run locally.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal bot error", err);
  process.exit(1);
});

// Simple /help and /registry commands
bot.command("help", async (ctx) => {
  await ctx.reply([
    "Команди бота:",
    "- /history — останні 5 відповідей",
    "- /registry — повний реєстр (надсилає Markdown-файл)",
    "- /help — список команд",
  ].join("\n"));
});

bot.command("registry", async (ctx) => {
  try {
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    const filePath = "data/entity-registry.md";
    ensureDirFor(filePath);
    writeFileSync(filePath, md, "utf8");
    try {
      await ctx.replyWithDocument(new InputFile(filePath), { caption: "Entity Registry (Markdown)" });
    } catch {
      // Fallback: send as text chunks
      const chunk = 3500;
      for (let i = 0; i < md.length; i += chunk) {
        const part = md.slice(i, i + chunk);
        try { await ctx.reply(part, { parse_mode: "Markdown" }); } catch { await ctx.reply(part); }
      }
    }
  } catch (e) {
    console.warn("/registry failed", e);
    await ctx.reply("Не вдалося сформувати реєстр.");
  }
});
