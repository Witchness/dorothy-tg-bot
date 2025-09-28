import { Bot, Context, SessionFlavor, session } from "grammy";
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
import { storeApiSample, storeUnhandledSample } from "./unhandled_logger.js";

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
  const result = await prev(method, payload, signal);
  try {
    const newKeys = recordApiShape(method, result);
    if (newKeys.length) {
      storeApiSample(method, result);
      void notifyAdmin(`New API response shape for ${method}: ${newKeys.join(", ")}`);
    }
  } catch (error) {
    console.warn("[registry] Не вдалося зафіксувати форму відповіді API", error);
  }
  return result;
});

bot.use(session<SessionData, MyContext>({
  initial: () => ({ history: [] }),
}));

bot.use(async (ctx, next) => {
  const updateRecord = toRecord(ctx.update);
  const keys = Object.keys(updateRecord).filter((key) => key !== "update_id");
  if (keys.length) {
    const newUpdateKeys = recordUpdateKeys(keys);
    if (newUpdateKeys.length) {
      storeUnhandledSample("update", updateRecord, newUpdateKeys);
      void notifyAdmin(`New update keys observed: ${newUpdateKeys.join(", ")}`);
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
      if (newPayloadKeys.length && !Array.isArray(payload)) {
        storeUnhandledSample(`update.${key}`, payloadRecord, newPayloadKeys);
        void notifyAdmin(`New payload keys for update.${key}: ${newPayloadKeys.join(", ")}`);
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

  if (analysis.alerts?.length) {
    void notifyAdmin(analysis.alerts.map((line) => `Alert (${ctx.chat?.id ?? "unknown"}): ${line}`).join("\n"));
  }
});

bot.on("callback_query", async (ctx) => {
  const payload = ctx.callbackQuery;
  const newKeys = recordCallbackKeys(Object.keys(payload));
  if (newKeys.length) {
    storeUnhandledSample("callback_query", toRecord(payload), newKeys);
    void notifyAdmin(`New callback_query keys: ${newKeys.join(", ")}`);
  }

  if (payload.message) {
    const messageRecord = toRecord(payload.message);
    const messageKeys = recordPayloadKeys("callback_query.message", Object.keys(messageRecord));
    if (messageKeys.length) {
      storeUnhandledSample("callback_query.message", messageRecord, messageKeys);
      void notifyAdmin(`New callback_query.message keys: ${messageKeys.join(", ")}`);
    }
  }

  await ctx.answerCallbackQuery();
});

bot.on("inline_query", async (ctx) => {
  const newKeys = recordInlineQueryKeys(Object.keys(ctx.inlineQuery));
  if (newKeys.length) {
    storeUnhandledSample("inline_query", toRecord(ctx.inlineQuery), newKeys);
    void notifyAdmin(`New inline_query keys: ${newKeys.join(", ")}`);
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
