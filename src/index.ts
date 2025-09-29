import { Bot, Context, GrammyError, SessionFlavor, session, InputFile, InlineKeyboard } from "grammy";
import "dotenv/config";
import { MINIMAL_UPDATES_9_2, ALL_UPDATES_9_2, MEDIA_GROUP_HOLD_MS, isKnownUpdateName } from "./constants.js";
import { analyzeMessage, analyzeMediaGroup, formatAnalysis } from "./analyzer.js";
import { renderMessageHTML, renderMediaGroupHTML, type QuoteRenderMode } from "./renderer.js";
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
import { rmSync } from "node:fs";
import { writeFileAtomic } from "./utils/safe_fs.js";
import { describeMessageKey } from "./humanize.js";
import { buildInlineKeyboardForDiff, parseRegCallback } from "./registry_actions.js";
import { buildInlineKeyboardForNestedPayload, buildInlineKeyboardForMessage } from "./registry_actions.js";
import { buildInlineKeyboardForScope } from "./registry_actions.js";
import { setStatus as setConfigStatus, setNote as setConfigNote, setStoragePolicy, getStoragePolicy } from "./registry_config.js";
import { resetConfigDefaults } from "./registry_config.js";
import { SEED_SCOPES, SEED_MESSAGE_KEYS, SEED_ENTITY_TYPES, buildSeedSamples } from "./seed_catalog.js";
import { createRegistryNotifier } from "./registry_notifier.js";
import { PresentKind, PresentPayload, replayPresentPayloads, DEFAULT_PRESENTALL_DELAY_MS } from "./presenter_replay.js";
import { runIfAllowlisted } from "./allowlist_gate.js";
import { drainMediaGroupEntry, type MediaGroupBufferEntry } from "./media_group_buffer.js";
import {
  buildPresentKeyboardForMessage,
  collectPresentPayloads,
  presentButtonLabelForKind,
  type PresentableMessage,
} from "./presenter/present_keyboard.js";

import { splitForTelegram } from "./text_utils.js";
import { replySafe as replySafeUtil, sendSafeMessage as sendSafeMessageUtil } from "./utils/safe_messaging.js";
import { createPresentCallbacksHandler } from "./handlers/present_callbacks.js";
import { createRegistryCallbacksHandler } from "./handlers/registry_callbacks.js";
import { createExpectPayloadCallbacksHandler } from "./handlers/expect_callbacks.js";

interface HistoryEntry {
  ts: number;
  preview: string;
}

interface SessionData {
  history: HistoryEntry[];
  pendingNote?: { kind: "s" | "k" | "t"; scope: string; name?: string };
  totalMessages: number;
  presentMode?: boolean;
  presentQuotes?: QuoteRenderMode;
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

const registryNotifier = createRegistryNotifier<MyContext>({
  debounceMs: 600,
  onFlush: async ({ context, diff, replyTo }) => {
    const text = formatDiffReport(diff);
    if (!text) return;
    const hint = "\n\nℹ️ Повний реєстр: /registry";
    const keyboard = buildInlineKeyboardForDiff(diff);
    try {
      await replySafe(context, text + hint, { reply_to_message_id: replyTo, reply_markup: keyboard ?? undefined });
    } catch (error) {
      console.warn("[registry-notifier] failed to deliver diff", error);
    }
    scheduleRegistryMarkdownRefresh();
  },
});


// Debounced Markdown snapshot refresh for the registry (keeps chat replies snappy)
let registryMdTimer: NodeJS.Timeout | null = null;
const scheduleRegistryMarkdownRefresh = (delayMs = 1000) => {
  if (registryMdTimer) clearTimeout(registryMdTimer);
  registryMdTimer = setTimeout(() => {
    try {
      const mdPath = "data/entity-registry.md";
      const md = buildRegistryMarkdown(statusRegistry.snapshot());
      writeFileAtomic(mdPath, md);
    } catch (e) {
      console.warn("[registry-md] failed to refresh markdown", e);
    } finally {
      registryMdTimer = null;
    }
  }, delayMs);
};

// Replace unpaired UTF-16 surrogates and split long messages safely for Telegram
const replySafe = async (ctx: MyContext, text: string, opts?: Parameters<MyContext["reply"]>[1]) => {
  await replySafeUtil(
    (chunk, options) => ctx.reply(chunk, options as any),
    text,
    opts as unknown as Record<string, unknown>,
  );
};

const sendSafeMessage = async (chatId: number | string, text: string, opts?: Parameters<typeof bot.api.sendMessage>[2]) => {
  await sendSafeMessageUtil(
    (id, chunk, options) => bot.api.sendMessage(id, chunk, options as any),
    chatId,
    text,
    opts as unknown as Record<string, unknown>,
  );
};

// In-memory present-action registry for sending files back
interface PresentAction { chatId: number; userId: number; payload: PresentPayload; expire: number; timer: NodeJS.Timeout }
const presentActions = new Map<string, PresentAction>();
const PRESENT_TTL_MS = 5 * 60 * 1000;
import { randomBytes } from "node:crypto";
const registerPresentAction = (ctx: MyContext, payload: PresentPayload): string => {
  const id = randomBytes(10).toString("hex");
  const expire = Date.now() + PRESENT_TTL_MS;
  const timer = setTimeout(() => presentActions.delete(id), PRESENT_TTL_MS);
  presentActions.set(id, { chatId: ctx.chat!.id, userId: ctx.from!.id, payload, expire, timer });
  return id;
};
// Bulk actions for albums
interface PresentBulk { items: PresentPayload[] }
const presentBulkActions = new Map<string, { chatId: number; userId: number; items: PresentPayload[]; expire: number; timer: NodeJS.Timeout }>();
const registerPresentBulk = (ctx: MyContext, items: PresentPayload[]): string => {
  const id = randomBytes(10).toString("hex");
  const expire = Date.now() + PRESENT_TTL_MS;
  const timer = setTimeout(() => presentBulkActions.delete(id), PRESENT_TTL_MS);
  presentBulkActions.set(id, { chatId: ctx.chat!.id, userId: ctx.from!.id, items, expire, timer });
  return id;
};

// Default present quote style sourced from env
const presentQuotesDefault: QuoteRenderMode = (((process.env.PRESENT_QUOTES ?? "prefix").trim().toLowerCase()) === "html" ? "html" : "prefix");

// Media group (album) handler
import { createAlbumHandler } from "./handlers/albums.js";
const albums = createAlbumHandler<MyContext>({
  statusRegistry,
  mediaGroupHoldMs: MEDIA_GROUP_HOLD_MS,
  presentQuotesDefault,
  replySafe: (ctx: MyContext, text: string, opts?: Parameters<MyContext["reply"]>[1]) => replySafeUtil(
    (chunk, options) => (ctx as any).reply(chunk, options as any),
    text,
    opts as unknown as Record<string, unknown>,
  ),
  registerPresentAction: (ctx: MyContext, payload: PresentPayload) => registerPresentAction(ctx as any, payload),
  registerPresentBulk: (ctx, items) => registerPresentBulk(ctx as any, items),
});
const removePath = (p: string) => {
  try { rmSync(p, { recursive: true, force: true }); } catch {}
};

bot.catch((err) => {
  console.error("Unhandled bot error", err.error);
});

const notifyAdmin = async (message: string) => {
  if (!adminChatId) return;
  try {
    await sendSafeMessage(adminChatId, message);
  } catch (error) {
    console.warn("[alerts] Failed to notify admin", error);
  }
};

bot.api.config.use(async (prev, method, payload, signal) => {
  // Enforce no link previews on all bot text messages by default
  try {
    if (method === "sendMessage" && payload && typeof payload === "object") {
      const p: any = payload;
      const lp = p.link_preview_options ?? {};
      p.link_preview_options = { is_disabled: true, ...lp };
    }
  } catch {}
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

const presentDefault = ((process.env.PRESENT_DEFAULT ?? "off").trim().toLowerCase() === "on");
bot.use(session<SessionData, MyContext>({
  initial: () => ({ history: [], totalMessages: 0, presentMode: presentDefault, presentQuotes: presentQuotesDefault }),
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
    // Schedule Markdown refresh
    scheduleRegistryMarkdownRefresh();
    await ctx.reply("Нотатку збережено ✅", { reply_to_message_id: ctx.message.message_id });
  } catch (e) {
    await ctx.reply("Не вдалося зберегти нотатку.");
  }
});

bot.use(async (ctx, next) => {
  // Early allowlist gate: drop untrusted updates before any registry instrumentation
  const uid = ctx.from?.id?.toString();
  const allowed = runIfAllowlisted(allowlist, uid, () => true, () => {
    try { console.info(`[allowlist] dropped uid=${uid ?? "unknown"} chat=${ctx.chat?.id ?? "-"}`); } catch {}
    return false;
  });
  if (!allowed) return;

  const updateRecord = toRecord(ctx.update);
  const keys = Object.keys(updateRecord).filter((key) => key !== "update_id");
  if (keys.length) {
    const newUpdateKeys = recordUpdateKeys(keys);
    const updateSnapshot = storeUnhandledSample("update", updateRecord, newUpdateKeys);
    if (newUpdateKeys.length) {
      try {
        const scopes = statusRegistry.observeScopes(newUpdateKeys);
        const visible = scopes.filter((s) => s.status !== "ignore");
        if (visible.length) {
          const chatId = ctx.chat?.id;
          if (typeof chatId === "number") {
            const replyTo = (ctx as any).message?.message_id ?? (ctx as any).editedMessage?.message_id;
            registryNotifier.queue(chatId, { diff: { newScopes: visible }, context: ctx, replyTo });
          }
        }
      } catch (e) {
        console.warn("[status-registry] failed to schedule scopes diff", e);
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
        if (key === "message" || key === "edited_message" || key === "channel_post" || key === "edited_channel_post" || key === "business_message" || key === "edited_business_message") {
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
  const allowed = runIfAllowlisted(allowlist, uid, () => true);
  if (!allowed) return;
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

import { createMessageHandler } from "./handlers/message.js";

bot.on("message", createMessageHandler({
  statusRegistry,
  albums,
  presentQuotesDefault,
  replySafe: (ctx: MyContext, text: string, opts?: Parameters<MyContext["reply"]>[1]) => replySafeUtil(
    (chunk, options) => (ctx as any).reply(chunk, options as any),
    text,
    opts as unknown as Record<string, unknown>,
  ),
  registerPresentAction: (ctx: MyContext, payload: PresentPayload) => registerPresentAction(ctx as any, payload),
} as any));

import { createEditedMessageHandler } from "./handlers/edited.js";

bot.on("edited_message", createEditedMessageHandler({ statusRegistry } as any));

import { createChannelPostHandler, createEditedChannelPostHandler } from "./handlers/channel.js";

// Channel posts
bot.on("channel_post", createChannelPostHandler({ statusRegistry } as any));

bot.on("edited_channel_post", createEditedChannelPostHandler({ statusRegistry } as any));

import { createBusinessMessageHandler, createEditedBusinessMessageHandler } from "./handlers/business.js";

// Business messages
bot.on("business_message", createBusinessMessageHandler({ statusRegistry } as any));

bot.on("edited_business_message", createEditedBusinessMessageHandler({ statusRegistry } as any));

// Handle present-action callbacks via dedicated handler
bot.use(createPresentCallbacksHandler({ presentActions, presentBulkActions, delayMs: DEFAULT_PRESENTALL_DELAY_MS }));
// Handle "add expected payload key" callbacks (exp|<label>|<key>)
bot.use(createExpectPayloadCallbacksHandler());

bot.on("callback_query:data", async (ctx, next) => {
  if ((ctx.callbackQuery?.data ?? "") !== "noop") return next();
  try {
    await ctx.answerCallbackQuery();
  } catch (e) {
    console.warn("[callbacks] failed to ack noop", e);
  }
});

bot.on("callback_query", async (ctx, next) => {
  // let dedicated handler process interactive registry actions
  if ((ctx.callbackQuery as any)?.data?.startsWith?.("reg|")) return next();
  const mode = statusRegistry.getMode();
  if (mode === "prod") return; // silent
  const scopeStatus = statusRegistry.getScopeStatus("callback_query") ?? "needs-review";
  if (scopeStatus === "ignore") return;
  const payload = ctx.callbackQuery;
  const keys = Object.keys(payload);
  // track callback_query keys in status registry
  statusRegistry.observeMessageKeys("callback_query", keys);
  const kbScope = buildInlineKeyboardForScope;
  // Build summary
  const lines: string[] = [
    "📣 Зафіксовано подію: callback_query",
    `- scope: callback_query`,
    keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
  ];
  let replyTo: number | undefined;
  let nestedKb = null;
  if (payload.message) {
    const msg = toRecord(payload.message);
    const mkeys = Object.keys(msg).filter((k) => { const v = (msg as any)[k]; return v !== undefined && v !== null && typeof v !== "function"; });
    const samples: Record<string, string> = {}; for (const k of mkeys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
    statusRegistry.observeMessageKeys("message", mkeys, samples);
    const types: string[] = [];
    const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
    const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
    statusRegistry.observeEntityTypes("message", Array.from(new Set(types)));
    lines.push(`- message.keys: ${mkeys.join(", ")}`);
    nestedKb = buildInlineKeyboardForNestedPayload("message.reply_to_message", mkeys, statusRegistry.snapshot());
    replyTo = (payload.message as any).message_id;
  }
  const keyboard = buildInlineKeyboardForScope("callback_query", statusRegistry.snapshot()) ?? nestedKb ?? undefined;
  if (replyTo) {
    await ctx.reply(lines.join("\n"), { reply_to_message_id: replyTo, reply_markup: keyboard });
  } else {
    await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
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
  const updatesPrefRaw = (process.env.ALLOWED_UPDATES ?? "minimal").trim().toLowerCase();
  const updatesPref = updatesPrefRaw ? updatesPrefRaw : "minimal";
  let allowed: readonly string[];
  if (updatesPref === "all") {
    allowed = ALL_UPDATES_9_2;
  } else if (updatesPref === "custom") {
    const customRaw = process.env.ALLOWED_UPDATES_LIST ?? "";
    const requested = customRaw.split(",").map((entry) => entry.trim()).filter(Boolean);
    const normalized: string[] = [];
    const invalid: string[] = [];
    for (const entry of requested) {
      const candidate = entry.toLowerCase();
      if (isKnownUpdateName(candidate)) {
        if (!normalized.includes(candidate)) normalized.push(candidate);
      } else {
        invalid.push(entry);
      }
    }
    if (invalid.length) {
      console.warn(`[startup] Ignoring unknown update types in ALLOWED_UPDATES_LIST: ${invalid.join(", ")}`);
    }
    if (!normalized.length) {
      console.warn("[startup] ALLOWED_UPDATES=custom but ALLOWED_UPDATES_LIST is empty or invalid. Falling back to minimal updates.");
      allowed = MINIMAL_UPDATES_9_2;
    } else {
      allowed = normalized;
    }
  } else if (updatesPref === "minimal") {
    allowed = MINIMAL_UPDATES_9_2;
  } else {
    console.warn(`[startup] Unsupported ALLOWED_UPDATES=${updatesPref}. Falling back to minimal updates.`);
    allowed = MINIMAL_UPDATES_9_2;
  }

  if (!allowed.includes("inline_query")) {
    console.warn("[startup] inline_query updates are disabled. Set ALLOWED_UPDATES=all або додайте inline_query до ALLOWED_UPDATES_LIST для підтримки inline mode.");
  }

  if (mode === "polling") {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.info("Starting bot in polling mode...");
    await bot.start({ allowed_updates: allowed as any });
    return;
  }

  console.error("Webhook mode is not configured in this template. Set MODE=polling to run locally.");
  process.exit(1);
}

import { registerRegistryCommands } from "./commands/registry.js";
import { registerRegCommands } from "./commands/reg.js";

// Register commands before starting
bot.command("help", async (ctx) => {
  await ctx.reply([
    "Команди бота:",
    "- /history — останні 5 відповідей",
    "- /registry — повний реєстр (надсилає Markdown-файл)",
    "- /registry_refresh — примусово оновити звіт",
    "- /registry_seed [process|needs-review] — заповнити БД відомими ключами",
    "- /registry_reset [hard] [wipe] — скинути статуси (hard: і конфіг), wipe: видалити логи",
    "- /reg — налаштування статусів (пояснення)",
    "- /reg_set — встановити статус вручну",
    "- /reg_mode <debug|dev|prod> — режим відображення",
    "- /reg_scope <scope> — керування для конкретного scope",
    "- /present <on|off> — вмикає/вимикає режим представлення",
    "- /present_quotes <html|prefix> — стиль цитат у представленнях",
    "- /env_missing — показати відсутні змінні середовища",
    "- /snapshots <off|last-3|all> — політика знімків handled-changes",
    "- /cancel — скасувати додавання нотатки",
    "- /help — список команд",
  ].join("\n"));
});

registerRegistryCommands(bot as any, statusRegistry);
bot.command("registry", async (ctx) => {
  try {
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    const filePath = "data/entity-registry.md";
    writeFileAtomic(filePath, md);
    try {
      await ctx.replyWithDocument(new InputFile(filePath), { caption: "Entity Registry (Markdown)" });
    } catch {
      // Fallback: send as text chunks
      for (const part of splitForTelegram(md, 3500)) {
        if (!part) continue;
        try { await ctx.reply(part, { parse_mode: "Markdown" }); } catch { await ctx.reply(part); }
      }
    }
  } catch (e) {
    console.warn("/registry failed", e);
    await ctx.reply("Не вдалося сформувати реєстр.");
  }
});

// Force regenerate Markdown and persist current registry state
bot.command("registry_refresh", async (ctx) => {
  try {
    statusRegistry.saveNow();
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    const filePath = "data/entity-registry.md";
    writeFileAtomic(filePath, md);
    try {
      await ctx.replyWithDocument(new InputFile(filePath), { caption: "Entity Registry (refreshed)" });
    } catch {
      // Fallback: send as text chunks
      for (const part of splitForTelegram(md, 3500)) {
        if (!part) continue;
        try { await ctx.reply(part, { parse_mode: "Markdown" }); } catch { await ctx.reply(part); }
      }
    }
  } catch (e) {
    console.warn("/registry_refresh failed", e);
    await ctx.reply("Не вдалося оновити звіт.");
  }
});

// Seed database with a catalog of scopes/keys/entity types
bot.command("registry_seed", async (ctx) => {
  const arg = (ctx.message?.text ?? "").split(/\s+/)[1] as any;
  const status: "process" | "needs-review" = arg === "process" ? "process" : "needs-review";
  try {
    // Scopes
    const newScopes = statusRegistry.observeScopes(SEED_SCOPES);

    // Message-like: message, edited_message
    for (const scope of Object.keys(SEED_MESSAGE_KEYS)) {
      const keys = SEED_MESSAGE_KEYS[scope];
      const samples = buildSeedSamples(keys);
      statusRegistry.observeMessageKeys(scope, keys, samples);
    }

    for (const scope of Object.keys(SEED_ENTITY_TYPES)) {
      statusRegistry.observeEntityTypes(scope, SEED_ENTITY_TYPES[scope]);
    }

    // Optionally set status for all seeded items
    if (status === "process") {
      for (const scope of SEED_SCOPES) {
        statusRegistry.setScopeStatus(scope, "process");
      }
      for (const [scope, keys] of Object.entries(SEED_MESSAGE_KEYS)) {
        for (const k of keys) statusRegistry.setMessageKeyStatus(scope, k, "process");
      }
      for (const [scope, types] of Object.entries(SEED_ENTITY_TYPES)) {
        for (const t of types) statusRegistry.setEntityTypeStatus(scope, t, "process");
      }
    }

    statusRegistry.saveNow();
    scheduleRegistryMarkdownRefresh();
    await ctx.reply(`✅ Seeded registry (${status}). Спробуйте /reg_scope message або /registry.`);
  } catch (e) {
    console.warn("/registry_seed failed", e);
    await ctx.reply("Не вдалося виконати seed.");
  }
});

// Reset registry status (and optionally config) to defaults for fresh setup
bot.command("registry_reset", async (ctx) => {
  const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
  const hard = parts.includes("hard");
  const wipe = parts.includes("wipe");
  try {
    if (hard) resetConfigDefaults();
    statusRegistry.reset(false);
    if (wipe) {
      removePath("data/handled");
      removePath("data/handled-changes");
      removePath("data/unhandled");
      removePath("data/api-errors");
    }
    scheduleRegistryMarkdownRefresh();
    await ctx.reply(`Скинуто ${hard ? "(hard: із конфігом)" : "(status only)"}${wipe ? ", очищено логи" : ""}. Режим: dev. Почніть із дозволу scope/keys під повідомленнями.`);
  } catch (e) {
    console.warn("/registry_reset failed", e);
    await ctx.reply("Не вдалося скинути реєстр.");
  }
});

registerRegCommands(bot as any, statusRegistry);
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
    "",
    "Режими:",
    "- /reg_mode debug — кнопки під кожним повідомленням",
    "- /reg_mode dev — тільки для нових (за замовчуванням)",
    "- /reg_mode prod — нічого не показувати",
    "",
    "Навігація:",
    "- /reg_scope message — показати кнопки для message",
    "- /reg_scope edited_message — показати кнопки для edited_message",
  ].join("\n"));
});

bot.command("reg_mode", async (ctx) => {
  const mode = (ctx.message?.text ?? "").split(/\s+/)[1] as any;
  if (!mode || !["debug", "dev", "prod"].includes(mode)) {
    await ctx.reply("Використання: /reg_mode <debug|dev|prod>");
    return;
  }
  try {
    const { setMode } = await import("./registry_config.js");
    setMode(mode);
    await ctx.reply(`Режим встановлено: ${mode}`);
  } catch {
    await ctx.reply("Не вдалося встановити режим.");
  }
});

bot.command("reg_scope", async (ctx) => {
  const arg = (ctx.message?.text ?? "").split(/\s+/)[1];
  const reg = statusRegistry.snapshot();
  const scopes = Object.keys(reg.scopes).sort();
  if (!arg) {
    await ctx.reply(["Вкажіть scope. Доступні:", scopes.join(", ")].join("\n"));
    return;
  }
  if (!reg.scopes[arg]) {
    await ctx.reply(`Невідомий scope: ${arg}. Доступні: ${scopes.join(", ")}`);
    return;
  }
    const kb = buildInlineKeyboardForScope(arg, reg);
    const keysCount = Object.keys(reg.keysByScope[arg] ?? {}).length;
    const typesCount = Object.keys(reg.entityTypesByScope[arg] ?? {}).length;
    const st = reg.scopes[arg]?.status ?? "needs-review";
    await ctx.reply(`Scope: ${arg} [${st}] — keys: ${keysCount}, types: ${typesCount}`, { reply_markup: kb ?? undefined });
});

main().catch((err) => {
  console.error("Fatal bot error", err);
  process.exit(1);
});
// Interactive status change via inline keyboard (moved to handler)
bot.use(createRegistryCallbacksHandler({
  parseRegCallback,
  setStatus: setConfigStatus as any,
  setNote: setConfigNote as any,
  scheduleMarkdownRefresh: () => scheduleRegistryMarkdownRefresh(),
  statusRegistry,
  buildInlineKeyboardForMessage,
}));

// Configure handled-changes snapshot retention
bot.command("snapshots", async (ctx) => {
  const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
  const arg = (parts[1] ?? "").toLowerCase();
  const valid = new Set(["off", "last-3", "all"]);
  if (!arg || !valid.has(arg)) {
    const current = getStoragePolicy().handledChanges;
    await ctx.reply([
      "Політика знімків handled-changes:",
      `- поточна: ${current}`,
      "Використання: /snapshots <off|last-3|all>",
    ].join("\n"));
    return;
  }
  try {
    setStoragePolicy(arg as any);
    await ctx.reply(`Застосовано політику знімків: ${arg}`);
  } catch (e) {
    await ctx.reply("Не вдалося застосувати політику знімків.");
  }
});

// Toggle presentation mode
bot.command("present", async (ctx) => {
  const arg = (ctx.message?.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();
  if (arg !== "on" && arg !== "off") {
    await ctx.reply(`Режим представлення: ${ctx.session.presentMode ? "on" : "off"}\nВикористання: /present <on|off>`);
    return;
  }
  ctx.session.presentMode = arg === "on";
  await ctx.reply(`Режим представлення: ${ctx.session.presentMode ? "on" : "off"}`);
});

// Toggle quote render mode for presenter
bot.command("present_quotes", async (ctx) => {
  const arg = (ctx.message?.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();
  if (arg !== "html" && arg !== "prefix") {
    await ctx.reply(`Стиль цитат: ${ctx.session.presentQuotes ?? presentQuotesDefault}\nВикористання: /present_quotes <html|prefix>`);
    return;
  }
  ctx.session.presentQuotes = (arg as any);
  await ctx.reply(`Стиль цитат: ${ctx.session.presentQuotes}`);
});

// Show missing env variables with suggested defaults
bot.command("env_missing", async (ctx) => {
  const expected: Array<{ key: string; def: string; note?: string }> = [
    { key: "BOT_TOKEN", def: "<required>" },
    { key: "MODE", def: "polling" },
    { key: "LOG_LEVEL", def: "info" },
    { key: "ALLOWLIST_USER_IDS", def: "" },
    { key: "ADMIN_CHAT_ID", def: "" },
    { key: "ALLOWED_UPDATES", def: "minimal", note: "all|minimal|custom" },
    { key: "ALLOWED_UPDATES_LIST", def: "message,edited_message", note: "used when ALLOWED_UPDATES=custom" },
    { key: "PRESENT_DEFAULT", def: presentDefault ? "on" : "off" },
    { key: "PRESENT_QUOTES", def: presentQuotesDefault },
    { key: "SNAPSHOT_HANDLED_CHANGES", def: "all" },
    { key: "SNAPSHOT_SIGN_DEPTH", def: "4" },
    { key: "SNAPSHOT_SIGN_MAX_KEYS", def: "40" },
    { key: "SNAPSHOT_SIGN_MAX_ITEMS", def: "10" },
    { key: "SNAPSHOT_SAN_MAX_DEPTH", def: "2" },
    { key: "SNAPSHOT_SAN_MAX_KEYS", def: "15" },
    { key: "SNAPSHOT_SAN_MAX_ITEMS", def: "5" },
    { key: "SNAPSHOT_SAN_MAX_STRING", def: "200" },
  ];
  const missing = expected.filter((e) => {
    const v = (process.env as any)[e.key];
    return typeof v !== "string" || v.trim() === "";
  });
  if (!missing.length) {
    await ctx.reply("✅ Усі очікувані змінні середовища задані.");
    return;
  }
  const lines: string[] = [];
  lines.push("Відсутні змінні середовища (рекомендовані значення):");
  for (const m of missing) {
    const note = m.note ? ` — ${m.note}` : "";
    lines.push(`- ${m.key}=${m.def}${note}`);
  }
  lines.push("\nДодайте ці ключі у .env (без лапок).");
  await replySafe(ctx, lines.join("\n"));
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
    writeFileAtomic(mdPath, md);
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
