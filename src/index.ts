import { Bot, Context, GrammyError, SessionFlavor, session, InputFile } from "grammy";
import "dotenv/config";
import { MINIMAL_UPDATES_9_2 } from "./constants.js";
import { analyzeMessage, formatAnalysis } from "./analyzer.js";
import {
  recordApiShape,
  recordCallbackKeys,
  recordInlineQueryKeys,
  recordMessageKeys,
  recordPayloadKeys,
  recordUpdateKeys,
} from "./entity_registry.js";
import { storeApiError, storeApiSample, storeUnhandledSample } from "./unhandled_logger.js";
import { RegistryStatus } from "./registry_status.js";
import { formatDiffReport } from "./notifier.js";
import { buildRegistryMarkdown } from "./report.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describeMessageKey } from "./humanize.js";
import { buildInlineKeyboardForDiff, parseRegCallback } from "./registry_actions.js";
import { setStatus as setConfigStatus, setNote as setConfigNote } from "./registry_config.js";

interface HistoryEntry {
  ts: number;
  preview: string;
}

interface SessionData {
  history: HistoryEntry[];
  pendingNote?: { kind: "s" | "k" | "t"; scope: string; name?: string };
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

// Capture note text after user taps "✏️ note" inline button
bot.on("message:text", async (ctx, next) => {
  const pending = ctx.session.pendingNote;
  if (!pending) return next();
  const note = ctx.message.text?.trim() ?? "";
  if (!note) {
    await ctx.reply("Порожня нотатка не збережена. Спробуйте ще раз або /cancel.", { reply_to_message_id: ctx.message.message_id });
    return; 
  }
  try {
    const kind = pending.kind === "s" ? "scope" : pending.kind === "k" ? "key" : "type";
    setConfigNote(kind, pending.scope, pending.name, note);
    ctx.session.pendingNote = undefined;
    // Refresh Markdown for visibility
    const mdPath = "data/entity-registry.md";
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    ensureDirFor(mdPath);
    writeFileSync(mdPath, md, "utf8");
    await ctx.reply("Нотатку збережено ✅", { reply_to_message_id: ctx.message.message_id });
  } catch (e) {
    await ctx.reply("Не вдалося зберегти нотатку.");
  }
});

bot.use(async (ctx, next) => {
  const updateRecord = toRecord(ctx.update);
  const keys = Object.keys(updateRecord).filter((key) => key !== "update_id");
  if (keys.length) {
    const newUpdateKeys = recordUpdateKeys(keys);
    const updateSnapshot = storeUnhandledSample("update", updateRecord, newUpdateKeys);
    if (newUpdateKeys.length) {
      // Also reflect in status registry and reply in chat if possible
      try {
        const scopes = statusRegistry.observeScopes(newUpdateKeys);
        const visible = scopes.filter((s) => s.status !== "ignore");
        const text = formatDiffReport({ newScopes: visible });
        if (text) {
          const hint = "\n\nℹ️ Повний реєстр: /registry";
          const replyTo = (ctx as any).message?.message_id ?? (ctx as any).editedMessage?.message_id;
          const kb = buildInlineKeyboardForDiff({ newScopes: visible });
          if (replyTo) {
            await ctx.reply(text + hint, { reply_to_message_id: replyTo, reply_markup: kb ?? undefined });
          } else {
            await ctx.reply(text + hint, { reply_markup: kb ?? undefined });
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
      // keep silent (debug: no admin notify)
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
          // debug only, no admin notify
        } else if (payloadSnapshot) {
          // debug only, no admin notify
        }
      }

      // Feed status registry for message-like scopes to capture origin and keys per scope
      try {
        if (key === "message" || key === "edited_message") {
          const samples: Record<string, string> = {};
          for (const k of payloadKeys) {
            samples[k] = describeMessageKey(k, (payloadRecord as any)[k]);
          }
          statusRegistry.observeMessageKeys(key, payloadKeys, samples);
          const types: string[] = [];
          const ents = Array.isArray((payloadRecord as any).entities) ? (payloadRecord as any).entities : [];
          const cents = Array.isArray((payloadRecord as any).caption_entities) ? (payloadRecord as any).caption_entities : [];
          for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
          if (types.length) statusRegistry.observeEntityTypes(key, Array.from(new Set(types)));
        }
      } catch (e) {
        console.warn("[status-registry] capture failed for", key, e);
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

bot.on("message", async (ctx, next) => {
  if (isCommandMessage(ctx)) return next();

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

  // Compute new message keys / entity types and reply in-thread with human-friendly details
  try {
    const record = ctx.message as unknown as Record<string, unknown>;
    const keys = Object.keys(record).filter((k) => {
      const v = (record as any)[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const newKeys = recordMessageKeys(keys);
    const types: string[] = [];
    const ents = Array.isArray((record as any).entities) ? (record as any).entities : [];
    const cents = Array.isArray((record as any).caption_entities) ? (record as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }

    const samples: Record<string, string> = {};
    for (const k of keys) { samples[k] = describeMessageKey(k, (record as any)[k]); }

    const keyDiff = keys.length ? statusRegistry.observeMessageKeys("message", keys, samples) : [];
    const typeDiff = types.length ? statusRegistry.observeEntityTypes("message", Array.from(new Set(types))) : [];
    if ((keyDiff && keyDiff.length) || (typeDiff && typeDiff.length)) {
      const diff = { newMessageKeys: keyDiff, newEntityTypes: typeDiff } as const;
      const text = formatDiffReport(diff);
      if (text) {
        const hint = "\n\nℹ️ Повний реєстр: /registry";
        const kb = buildInlineKeyboardForDiff(diff);
        await ctx.reply(text + hint, { reply_to_message_id: ctx.message.message_id, reply_markup: kb ?? undefined });
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

// Handle edited messages similarly (reply about new keys/types in edited_message)
bot.on("edited_message", async (ctx) => {
  if (statusRegistry.isScopeIgnored("edited_message")) return;
  try {
    const msg = ctx.editedMessage as unknown as Record<string, unknown>;
    const keys = Object.keys(msg).filter((k) => {
      const v = (msg as any)[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const types: string[] = [];
    const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
    const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
    const uniqTypes = Array.from(new Set(types));

    const samples: Record<string, string> = {};
    for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }

    const keyDiff = keys.length ? statusRegistry.observeMessageKeys("edited_message", keys, samples) : [];
    const typeDiff = uniqTypes.length ? statusRegistry.observeEntityTypes("edited_message", uniqTypes) : [];
    if ((keyDiff && keyDiff.length) || (typeDiff && typeDiff.length)) {
      // Use custom header to clarify scope
      const lines: string[] = [];
      if (keyDiff.length) {
        lines.push("Нові ключі у edited_message:");
        for (const k of keyDiff) lines.push(`- ${k.key}: ${k.status}${k.sample ? "; приклад: " + k.sample : ""}`);
      }
      if (typeDiff.length) {
        if (lines.length) lines.push("");
        lines.push("Нові типи ентіті у edited_message:");
        for (const t of typeDiff) lines.push(`- ${t.type}: ${t.status}`);
      }
      const text = lines.join("\n");
      const hint = "\n\nℹ️ Повний реєстр: /registry";
      await ctx.reply(text + hint, { reply_to_message_id: ctx.editedMessage.message_id });
      const mdPath = "data/entity-registry.md";
      const md = buildRegistryMarkdown(statusRegistry.snapshot());
      ensureDirFor(mdPath);
      writeFileSync(mdPath, md, "utf8");
    }
  } catch (e) {
    console.warn("[status-registry] failed to reply edited_message diff", e);
  }
});

bot.on("callback_query", async (ctx, next) => {
  // let dedicated handler process interactive registry actions
  if ((ctx.callbackQuery as any)?.data?.startsWith?.("reg|")) return next();
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

// Register commands before starting
bot.command("help", async (ctx) => {
  await ctx.reply([
    "Команди бота:",
    "- /history — останні 5 відповідей",
    "- /registry — повний реєстр (надсилає Markdown-файл)",
    "- /reg — налаштування статусів (пояснення)",
    "- /reg_set — встановити статус вручну",
    "- /cancel — скасувати додавання нотатки",
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

bot.command("reg", async (ctx) => {
  await ctx.reply([
    "Налаштування статусів (process/ignore/needs-review):",
    "- Не треба запам'ятовувати команди — при нових ключах/типах бот додає кнопки під повідомленням.",
    "- Можна редагувати файл data/registry-config.json — зміни підхоплюються без перезапуску.",
    "",
    "Приклади команд (не обов'язково):",
    "- scope: edited_message → process",
    "- key: message.photo → ignore",
    "- type: message.spoiler → process",
  ].join("\n"));
});

main().catch((err) => {
  console.error("Fatal bot error", err);
  process.exit(1);
});
// Interactive status change via inline keyboard
bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery?.data ?? "";
  if (!data.startsWith("reg|")) return next();
  const parsed = parseRegCallback(data);
  if (!parsed) return next();
  try {
    if ((parsed as any).status === ("note" as any)) {
      ctx.session.pendingNote = { kind: parsed.kind, scope: parsed.scope, name: parsed.name } as any;
      await ctx.answerCallbackQuery();
      const label = parsed.kind === "s" ? parsed.scope : `${parsed.scope}.${parsed.name}`;
      await ctx.reply(`Введіть нотатку для ${label} (або /cancel):`, { reply_to_message_id: ctx.callbackQuery.message?.message_id });
      return;
    }

    const status = parsed.status;
    const label = parsed.kind === "s" ? parsed.scope : `${parsed.scope}.${parsed.name}`;
    const kind = parsed.kind === "s" ? "scope" : parsed.kind === "k" ? "key" : "type";
    setConfigStatus(kind, parsed.scope, parsed.name, status);
    if (parsed.kind === "s") {
      statusRegistry.setScopeStatus(parsed.scope, status);
    } else if (parsed.kind === "k" && parsed.name) {
      statusRegistry.setMessageKeyStatus(parsed.scope, parsed.name, status);
    } else if (parsed.kind === "t" && parsed.name) {
      statusRegistry.setEntityTypeStatus(parsed.scope, parsed.name, status);
    }
    const mdPath = "data/entity-registry.md";
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    ensureDirFor(mdPath);
    writeFileSync(mdPath, md, "utf8");
    await ctx.answerCallbackQuery({ text: `Updated: ${label} → ${status}` });
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Failed to update status", show_alert: true });
  }
});

// Power command: /reg_set <scope|key|type> <name> <status>
bot.command("reg_set", async (ctx) => {
  const text = ctx.message?.text ?? "";
  const parts = text.trim().split(/\s+/);
  if (parts.length < 4) {
    await ctx.reply("Використання: /reg_set <scope|key|type> <name> <process|ignore|needs-review>\nПриклад: /reg_set key message.photo ignore");
    return;
  }
  const kindToken = parts[1];
  const nameToken = parts[2];
  const statusToken = parts[3] as any;
  if (!["process", "ignore", "needs-review"].includes(statusToken)) {
    await ctx.reply("Статус має бути: process | ignore | needs-review");
    return;
  }
  try {
    if (kindToken === "scope") {
      setConfigStatus("scope", nameToken, undefined, statusToken);
      statusRegistry.setScopeStatus(nameToken, statusToken);
    } else if (kindToken === "key") {
      const [scope, key] = nameToken.split(".");
      if (!scope || !key) throw new Error("Форма для key: <scope>.<key>");
      setConfigStatus("key", scope, key, statusToken);
      statusRegistry.setMessageKeyStatus(scope, key, statusToken);
    } else if (kindToken === "type") {
      const [scope, type] = nameToken.split(".");
      if (!scope || !type) throw new Error("Форма для type: <scope>.<type>");
      setConfigStatus("type", scope, type, statusToken);
      statusRegistry.setEntityTypeStatus(scope, type, statusToken);
    } else {
      throw new Error("kind: scope | key | type");
    }
    const mdPath = "data/entity-registry.md";
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    ensureDirFor(mdPath);
    writeFileSync(mdPath, md, "utf8");
    await ctx.reply("Оновлено ✅");
  } catch (e) {
    await ctx.reply(`Помилка: ${(e as Error).message}`);
  }
});

// Cancel pending note
bot.command("cancel", async (ctx) => {
  if (ctx.session.pendingNote) {
    ctx.session.pendingNote = undefined;
    await ctx.reply("Скасовано.");
  }
});
