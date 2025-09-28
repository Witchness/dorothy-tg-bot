import { Bot, Context, GrammyError, SessionFlavor, session, InputFile, InlineKeyboard } from "grammy";
import "dotenv/config";
import { MINIMAL_UPDATES_9_2, ALL_UPDATES_9_2, MEDIA_GROUP_HOLD_MS } from "./constants.js";
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
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { describeMessageKey } from "./humanize.js";
import { buildInlineKeyboardForDiff, parseRegCallback } from "./registry_actions.js";
import { buildInlineKeyboardForNestedPayload, buildInlineKeyboardForMessage } from "./registry_actions.js";
import { buildInlineKeyboardForScope } from "./registry_actions.js";
import { setStatus as setConfigStatus, setNote as setConfigNote, setStoragePolicy, getStoragePolicy } from "./registry_config.js";
import { resetConfigDefaults } from "./registry_config.js";
import { SEED_SCOPES, SEED_MESSAGE_KEYS, SEED_ENTITY_TYPES, buildSeedSamples } from "./seed_catalog.js";

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

// In-memory buffer to aggregate Telegram media albums (media_group_id)
const mediaGroupBuffers = new Map<string, { ctx: MyContext; items: any[]; timer: NodeJS.Timeout }>();

const flushMediaGroupBuffer = async (key: string) => {
  try {
    const buf = mediaGroupBuffers.get(key);
    if (!buf) return;
    const items = buf.items as any[];
    mediaGroupBuffers.delete(key);
    const canText = (statusRegistry.getMessageKeyStatus("message", "text") === "process") || (statusRegistry.getMessageKeyStatus("message", "caption") === "process");
    try { console.info(`[present] album start chat=${buf.ctx.chat?.id} items=${items.length} present=${(buf.ctx.session as any).presentMode} canText=${canText}`); } catch {}
    const analysis = analyzeMediaGroup(items as any);
    const response = formatAnalysis(analysis);
    const previewLine = response.split("\n")[0] ?? "повідомлення";
    const entry: HistoryEntry = { ts: Date.now(), preview: previewLine };
    buf.ctx.session.totalMessages += 1;
    buf.ctx.session.history.push(entry);
    if (buf.ctx.session.history.length > 10) {
      buf.ctx.session.history.splice(0, buf.ctx.session.history.length - 10);
    }
    const header = `Повідомлення #${buf.ctx.session.totalMessages} у нашій розмові.`;
    const lastId = (items.at(-1) as any)?.message_id;
    // Presentation for album if enabled
    try {
      if ((buf.ctx.session as any).presentMode) {
        // Build keyboard: one button per media item
        const kb = new InlineKeyboard();
        let rows = 0;
        let index = 1;
        const allPayloads: PresentPayload[] = [];
        for (const m of items as any[]) {
          const inner = buildPresentKeyboardForMessage(buf.ctx, m);
          if (inner) {
            // Flatten: add a compact label per item
            if (Array.isArray(m.photo) && m.photo.length) {
              const p = { kind: "photo" as const, file_id: m.photo[m.photo.length-1].file_id };
              allPayloads.push(p);
              kb.text(`📷 Фото ${index}`, `present|${registerPresentAction(buf.ctx, p)}`).row(); rows++;
            } else if (m.video?.file_id) {
              const v = { kind: "video" as const, file_id: m.video.file_id };
              allPayloads.push(v);
              kb.text(`🎬 Відео ${index}`, `present|${registerPresentAction(buf.ctx, v)}`).row(); rows++;
            } else if (m.document?.file_id) {
              const d = { kind: "document" as const, file_id: m.document.file_id };
              allPayloads.push(d);
              kb.text(`📄 Документ ${index}`, `present|${registerPresentAction(buf.ctx, d)}`).row(); rows++;
            } else if (m.animation?.file_id) {
              const a = { kind: "animation" as const, file_id: m.animation.file_id };
              allPayloads.push(a);
              kb.text(`🖼️ GIF ${index}`, `present|${registerPresentAction(buf.ctx, a)}`).row(); rows++;
            }
          }
          index++;
        }
        if (allPayloads.length > 1) {
          const bulkId = registerPresentBulk(buf.ctx, allPayloads);
          kb.text("📦 Надіслати всі", `presentall|${bulkId}`).row();
          rows++;
        }
        const { html } = renderMediaGroupHTML(items as any, (buf.ctx.session.presentQuotes ?? presentQuotesDefault));
        const cp = Array.from(html).length;
        try { console.info(`[present] album html len=${cp} rows=${rows} parse=${cp <= 3500}`); } catch {}
        if (cp > 0) {
          if (cp <= 3500) {
            try { await buf.ctx.reply(html, { parse_mode: "HTML", reply_to_message_id: lastId, reply_markup: rows ? kb : undefined }); console.info(`[present] album html sent parse=true`); }
            catch (e) { console.warn(`[present] album html send failed, fallback text`, e); await replySafe(buf.ctx, html, { reply_to_message_id: lastId, reply_markup: rows ? kb : undefined }); }
          } else {
            await replySafe(buf.ctx, html, { reply_to_message_id: lastId, reply_markup: rows ? kb : undefined });
          }
        }
      }
    } catch {}
    if (canText) {
      await replySafe(buf.ctx, `${header}\n${response}`, { reply_to_message_id: lastId });
    }

    if (analysis.alerts?.length) {
      const mode = statusRegistry.getMode();
      if (mode !== "prod") {
        const payloadKeyRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
        const payloadShapeRe = /^New payload shape detected for\s+([^\s]+)\s*\(([^)]+)\)$/i;
        const lines: string[] = [];
        for (const a of analysis.alerts) {
          let m = a.match(payloadKeyRe);
          if (m) { lines.push(`- Нові ключі у ${m[1]}: ${m[2]}`); continue; }
          m = a.match(payloadShapeRe);
          if (m) { lines.push(`- Нова форма payload ${m[1]}: ${m[2]}`); continue; }
        }
        if (lines.length) {
          await replySafe(buf.ctx, ["🔬 Вкладені payload-и (альбом):", ...lines].join("\n"), { reply_to_message_id: lastId });
        }
      }
    }
  } catch (e) {
    console.warn("[media-group] flush failed", e);
  }
};

// Debounced Markdown snapshot refresh for the registry (keeps chat replies snappy)
let registryMdTimer: NodeJS.Timeout | null = null;
const scheduleRegistryMarkdownRefresh = (delayMs = 1000) => {
  if (registryMdTimer) clearTimeout(registryMdTimer);
  registryMdTimer = setTimeout(() => {
    try {
      const mdPath = "data/entity-registry.md";
      const md = buildRegistryMarkdown(statusRegistry.snapshot());
      ensureDirFor(mdPath);
      writeFileSync(mdPath, md, "utf8");
    } catch (e) {
      console.warn("[registry-md] failed to refresh markdown", e);
    } finally {
      registryMdTimer = null;
    }
  }, delayMs);
};

const ensureDirFor = (filePath: string) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};
// Replace unpaired UTF-16 surrogates and split long messages safely for Telegram
const toValidUnicode = (s: string): string => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch >= 0xd800 && ch <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      } else {
        out += "\uFFFD";
      }
    } else if (ch >= 0xdc00 && ch <= 0xdfff) {
      out += "\uFFFD";
    } else {
      out += s[i];
    }
  }
  return out;
};
const splitForTelegram = (s: string, limit = 4096): string[] => {
  const cps = Array.from(s);
  const parts: string[] = [];
  for (let i = 0; i < cps.length; i += limit) parts.push(cps.slice(i, i + limit).join(""));
  return parts.length ? parts : [""];
};
const replySafe = async (ctx: MyContext, text: string, opts?: Parameters<MyContext["reply"]>[1]) => {
  const safe = toValidUnicode(text);
  if (!safe || safe.trim().length === 0) return;
  const chunks = splitForTelegram(safe, 4096);
  let first = true;
  for (const chunk of chunks) {
    if (!chunk || chunk.length === 0) continue;
    try {
      const baseOpts = first ? (opts ?? {}) : {};
      const merged: any = { ...baseOpts };
      const lp = (merged as any).link_preview_options ?? {};
      merged.link_preview_options = { is_disabled: true, ...lp };
      await ctx.reply(chunk, merged);
    } catch (e) {
      try {
        await ctx.reply(chunk, { link_preview_options: { is_disabled: true } } as any);
      } catch (e2) {
        console.warn("[replySafe] failed to send chunk", e2);
      }
    }
    first = false;
  }
};

// In-memory present-action registry for sending files back
type PresentKind = "photo" | "video" | "document" | "animation" | "audio" | "voice" | "video_note" | "sticker";
interface PresentPayload { kind: PresentKind; file_id: string }
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
const buildPresentKeyboardForMessage = (ctx: MyContext, msg: any): InlineKeyboard | null => {
  const kb = new InlineKeyboard();
  let rows = 0;
  const addBtn = (label: string, payload: PresentPayload) => {
    const id = registerPresentAction(ctx, payload);
    kb.text(label, `present|${id}`).row();
    rows += 1;
  };
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const largest = msg.photo[msg.photo.length - 1];
    if (largest?.file_id) addBtn("📷 Фото", { kind: "photo", file_id: largest.file_id });
  }
  if (msg.video?.file_id) addBtn("🎬 Відео", { kind: "video", file_id: msg.video.file_id });
  if (msg.document?.file_id) {
    const name = msg.document.file_name ? ` (${msg.document.file_name})` : "";
    addBtn(`📄 Документ${name}`, { kind: "document", file_id: msg.document.file_id });
  }
  if (msg.animation?.file_id) addBtn("🖼️ GIF", { kind: "animation", file_id: msg.animation.file_id });
  if (msg.audio?.file_id) addBtn("🎵 Аудіо", { kind: "audio", file_id: msg.audio.file_id });
  if (msg.voice?.file_id) addBtn("🎤 Голос", { kind: "voice", file_id: msg.voice.file_id });
  if (msg.video_note?.file_id) addBtn("🟡 Відео-нота", { kind: "video_note", file_id: msg.video_note.file_id });
  if (msg.sticker?.file_id) addBtn("🔖 Стікер", { kind: "sticker", file_id: msg.sticker.file_id });
  return rows ? kb : null;
};
const removePath = (p: string) => {
  try { rmSync(p, { recursive: true, force: true }); } catch {}
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
const presentQuotesDefault: QuoteRenderMode = (((process.env.PRESENT_QUOTES ?? "prefix").trim().toLowerCase()) === "html" ? "html" : "prefix");
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
  if (allowlist.size && (!uid || !allowlist.has(uid))) {
    try { console.info(`[allowlist] dropped uid=${uid ?? "unknown"} chat=${ctx.chat?.id ?? "-"}`); } catch {}
    return;
  }

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
          // Schedule Markdown snapshot refresh
          scheduleRegistryMarkdownRefresh();
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

  const mode = statusRegistry.getMode();
  const msgRec = ctx.message as unknown as Record<string, unknown>;
  const keys = Object.keys(msgRec).filter((k) => {
    const v = (msgRec as any)[k];
    return v !== undefined && v !== null && typeof v !== "function";
  });
  const types: string[] = [];
  const ents = Array.isArray((msgRec as any).entities) ? (msgRec as any).entities : [];
  const cents = Array.isArray((msgRec as any).caption_entities) ? (msgRec as any).caption_entities : [];
  for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }

  // Update registry for seen keys/types
  const samples: Record<string, string> = {}; for (const k of keys) samples[k] = describeMessageKey(k, (msgRec as any)[k]);
  const keyDiff = keys.length ? statusRegistry.observeMessageKeys("message", keys, samples) : [];
  const typeDiff = types.length ? statusRegistry.observeEntityTypes("message", Array.from(new Set(types))) : [];

  // Gate by scope: if not processed, ask to enable and show present keys (debug/dev only)
  const scopeStatus = statusRegistry.getScopeStatus("message") ?? "needs-review";
  if (scopeStatus === "ignore") {
    return; // fully silent for ignored scope
  }
  if (scopeStatus !== "process") {
    if (mode !== "prod") {
      const kb = buildInlineKeyboardForMessage("message", keys, Array.from(new Set(types)), statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
      const text = [
        "🔒 Цей scope ще не дозволено для обробки:",
        `- scope: message [${scopeStatus}]`,
        keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
      ].join("\n");
      await ctx.reply(text, { reply_to_message_id: ctx.message.message_id, reply_markup: kb ?? undefined });
    }
    return;
  }

  // Scope is processed: if there are unprocessed keys/types, in dev/debug show prompt to enable them
  const pendingKeys = keys.filter((k) => (statusRegistry.getMessageKeyStatus("message", k) ?? "needs-review") === "needs-review");
  const pendingTypes = Array.from(new Set(types)).filter((t) => (statusRegistry.getEntityTypeStatus("message", t) ?? "needs-review") === "needs-review");
  if (mode !== "prod" && (pendingKeys.length || pendingTypes.length)) {
    const kb = buildInlineKeyboardForMessage(
      "message",
      pendingKeys.length ? pendingKeys : [],
      pendingTypes.length ? pendingTypes : [],
      statusRegistry.snapshot(),
      mode === "debug" ? "debug" : "dev",
      samples,
    );
    const text = [
      "🧰 Налаштувати обробку ключів для цього повідомлення:",
      pendingKeys.length ? `- нові/необроблені keys: ${pendingKeys.join(", ")}` : "- keys: всі дозволені",
      pendingTypes.length ? `- нові/необроблені entity types: ${pendingTypes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await ctx.reply(text, { reply_to_message_id: ctx.message.message_id, reply_markup: kb ?? undefined });
  }

  // Only analyze if text/caption is allowed
  const canText = (statusRegistry.getMessageKeyStatus("message", "text") === "process") || (statusRegistry.getMessageKeyStatus("message", "caption") === "process");

  // Media group (album) aggregation: buffer parts and reply once per album
  const mgid = (ctx.message as any).media_group_id as string | undefined;
  if (mgid) {
    const key = `${ctx.chat?.id}:${mgid}`;
    const present = mediaGroupBuffers.get(key);
    if (present) {
      clearTimeout(present.timer);
      present.items.push(ctx.message);
      present.ctx = ctx; // keep latest context for session/reply
      present.timer = setTimeout(() => void flushMediaGroupBuffer(key), MEDIA_GROUP_HOLD_MS);
    } else {
      const timer = setTimeout(() => void flushMediaGroupBuffer(key), MEDIA_GROUP_HOLD_MS);
      mediaGroupBuffers.set(key, { ctx, items: [ctx.message], timer });
    }
    return; // skip per-item analysis for album parts
  }
  // Presentation (HTML) regardless of canText
  try {
    if ((ctx.session as any).presentMode) {
      try {
        const m: any = ctx.message;
        const hasMedia = [m.photo?.length?"photo":"", m.video?"video":"", m.document?"document":"", m.animation?"animation":"", m.audio?"audio":"", m.voice?"voice":"", m.sticker?"sticker":""].filter(Boolean).join(",");
        const srcText = (m.text ?? m.caption ?? "") as string;
        const entities = (m.entities ?? m.caption_entities ?? []) as any[];
        console.info(`[present] single start mid=${m.message_id} chat=${ctx.chat?.id} media=[${hasMedia}] textLen=${srcText.length} ents=${entities.length}`);
        const kb = buildPresentKeyboardForMessage(ctx, m);
        const { html } = renderMessageHTML(m, (ctx.session.presentQuotes ?? presentQuotesDefault));
        const cp = Array.from(html).length;
        console.info(`[present] single html len=${cp} kb=${kb ? 1 : 0} parse=${cp <= 3500}`);
        if (cp > 0) {
          if (cp <= 3500) {
            try { await ctx.reply(html, { parse_mode: "HTML", reply_to_message_id: m.message_id, reply_markup: kb ?? undefined }); console.info(`[present] single html sent parse=true`); }
            catch (e) { console.warn(`[present] single html send failed, fallback text`, e); await replySafe(ctx, html, { reply_to_message_id: m.message_id, reply_markup: kb ?? undefined }); }
          } else {
            await replySafe(ctx, html, { reply_to_message_id: m.message_id, reply_markup: kb ?? undefined });
          }
        }
      } catch {}
    }
  } catch {}

  let lastAnalysis: ReturnType<typeof analyzeMessage> | null = null;
  if (canText) {
    const analysis = analyzeMessage(ctx.message);
    lastAnalysis = analysis;
    const response = formatAnalysis(analysis);
    const previewLine = response.split("\n")[0] ?? "повідомлення";
    const entry: HistoryEntry = { ts: Date.now(), preview: previewLine };
    ctx.session.totalMessages += 1;
    ctx.session.history.push(entry);
    if (ctx.session.history.length > 10) {
      ctx.session.history.splice(0, ctx.session.history.length - 10);
    }
    const header = `Повідомлення #${ctx.session.totalMessages} у нашій розмові.`;
    try { console.info(`[present] analysis allowed=${canText} len=${response.length}`); } catch {}
    await replySafe(ctx, `${header}\n${response}`);
  }

  // Show analyzer payload alerts in-thread instead of admin chat (only if we analyzed)
  if (canText && lastAnalysis?.alerts?.length) {
    const analysis = lastAnalysis;
    if (analysis.alerts?.length) {
      const mode = statusRegistry.getMode();
      if (mode === "prod") return;
      const payloadKeyRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
      const payloadShapeRe = /^New payload shape detected for\s+([^\s]+)\s*\(([^)]+)\)$/i;
      const lines: string[] = [];
      const nested: Array<{ label: string; keys: string[] }> = [];
      for (const a of analysis.alerts) {
        let m = a.match(payloadKeyRe);
        if (m) {
          const label = m[1];
          const keysStr = m[2];
          const arr = keysStr.split(",").map((s: string) => s.trim()).filter(Boolean);
          lines.push(`- Нові ключі у ${label}: ${arr.join(", ")}`);
          nested.push({ label, keys: arr });
          continue;
        }
        m = a.match(payloadShapeRe);
        if (m) {
          const label = m[1];
          const sig = m[2];
          lines.push(`- Нова форма payload ${label}: ${sig}`);
          continue;
        }
      }
      if (lines.length) {
        const regSnap = statusRegistry.snapshot();
        const kb = nested.length ? buildInlineKeyboardForNestedPayload(nested[0].label, nested[0].keys, regSnap) : null;
        await replySafe(ctx, ["🔬 Вкладені payload-и:", ...lines].join("\n"), { reply_to_message_id: ctx.message.message_id, reply_markup: kb ?? undefined });
      }
    }
  }
});

// Handle edited messages similarly (reply about new keys/types in edited_message)
bot.on("edited_message", async (ctx) => {
  try {
    const mode = statusRegistry.getMode();
    if (mode === "prod") return; // silent in prod
    const scopeStatus = statusRegistry.getScopeStatus("edited_message") ?? "needs-review";
    if (scopeStatus === "ignore") return;

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

    // Always post an event summary in debug/dev
    const kb = buildInlineKeyboardForMessage("edited_message", keys, uniqTypes, statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
    const scopeStatusEm = statusRegistry.getScopeStatus("edited_message") ?? "needs-review";
    const summary = [
      "✏️ Зафіксовано редагування повідомлення:",
      `- scope: edited_message [${scopeStatusEm}]`,
      keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
      uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await ctx.reply(summary, { reply_to_message_id: ctx.editedMessage.message_id, reply_markup: kb ?? undefined });

    // If there are new keys/types, add an extra diff block
    if ((keyDiff && keyDiff.length) || (typeDiff && typeDiff.length)) {
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
    console.warn("[status-registry] failed to post edited_message event", e);
  }
});

// Channel posts
bot.on("channel_post", async (ctx) => {
  try {
    const mode = statusRegistry.getMode();
    if (mode === "prod") return;
    const scopeStatusCh = statusRegistry.getScopeStatus("channel_post") ?? "needs-review";
    if (scopeStatusCh === "ignore") return;
    const msg = ctx.channelPost as unknown as Record<string, unknown>;
    const keys = Object.keys(msg).filter((k) => {
      const v = (msg as any)[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const types: string[] = [];
    const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
    const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
    const uniqTypes = Array.from(new Set(types));

    const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
    statusRegistry.observeMessageKeys("channel_post", keys, samples);
    statusRegistry.observeEntityTypes("channel_post", uniqTypes);

    const kb = buildInlineKeyboardForMessage("channel_post", keys, uniqTypes, statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
    
    const summary = [
      "📣 Зафіксовано подію: channel_post",
      `- scope: channel_post [${scopeStatusCh}]`,
      keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
      uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await ctx.reply(summary, { reply_to_message_id: (ctx.channelPost as any).message_id, reply_markup: kb ?? undefined });
  } catch (e) {
    console.warn("[status-registry] failed to post channel_post event", e);
  }
});

bot.on("edited_channel_post", async (ctx) => {
  try {
    const mode = statusRegistry.getMode();
    if (mode === "prod") return;
    const scopeStatusEch = statusRegistry.getScopeStatus("edited_channel_post") ?? "needs-review";
    if (scopeStatusEch === "ignore") return;
    const msg = ctx.editedChannelPost as unknown as Record<string, unknown>;
    const keys = Object.keys(msg).filter((k) => {
      const v = (msg as any)[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const types: string[] = [];
    const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
    const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
    const uniqTypes = Array.from(new Set(types));

    const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
    statusRegistry.observeMessageKeys("edited_channel_post", keys, samples);
    statusRegistry.observeEntityTypes("edited_channel_post", uniqTypes);

    const kb = buildInlineKeyboardForMessage("edited_channel_post", keys, uniqTypes, statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
    
    const summary = [
      "✏️ Зафіксовано редагування каналу:",
      `- scope: edited_channel_post [${scopeStatusEch}]`,
      keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
      uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await ctx.reply(summary, { reply_to_message_id: (ctx.editedChannelPost as any).message_id, reply_markup: kb ?? undefined });
  } catch (e) {
    console.warn("[status-registry] failed to post edited_channel_post event", e);
  }
});

// Business messages
bot.on("business_message", async (ctx) => {
  try {
    const mode = statusRegistry.getMode();
    if (mode === "prod") return;
    const scopeStatusBm = statusRegistry.getScopeStatus("business_message") ?? "needs-review";
    if (scopeStatusBm === "ignore") return;
    const msg = (ctx as any).businessMessage as Record<string, unknown>;
    if (!msg) return;
    const keys = Object.keys(msg).filter((k) => { const v = (msg as any)[k]; return v !== undefined && v !== null && typeof v !== "function"; });
    const types: string[] = [];
    const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
    const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
    const uniqTypes = Array.from(new Set(types));

    const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
    statusRegistry.observeMessageKeys("business_message", keys, samples);
    statusRegistry.observeEntityTypes("business_message", uniqTypes);
    const kb = buildInlineKeyboardForMessage("business_message", keys, uniqTypes, statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
    
    const summary = [
      "📣 Зафіксовано подію: business_message",
      `- scope: business_message [${scopeStatusBm}]`,
      keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
      uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await ctx.reply(summary, { reply_to_message_id: (msg as any).message_id, reply_markup: kb ?? undefined });
  } catch (e) {
    console.warn("[status-registry] failed to post business_message event", e);
  }
});

bot.on("edited_business_message", async (ctx) => {
  try {
    const mode = statusRegistry.getMode();
    if (mode === "prod") return;
    const scopeStatusEbm = statusRegistry.getScopeStatus("edited_business_message") ?? "needs-review";
    if (scopeStatusEbm === "ignore") return;
    const msg = (ctx as any).editedBusinessMessage as Record<string, unknown>;
    if (!msg) return;
    const keys = Object.keys(msg).filter((k) => { const v = (msg as any)[k]; return v !== undefined && v !== null && typeof v !== "function"; });
    const types: string[] = [];
    const ents = Array.isArray((msg as any).entities) ? (msg as any).entities : [];
    const cents = Array.isArray((msg as any).caption_entities) ? (msg as any).caption_entities : [];
    for (const e of [...ents, ...cents]) { if (e && typeof e.type === "string") types.push(e.type); }
    const uniqTypes = Array.from(new Set(types));

    const samples: Record<string, string> = {}; for (const k of keys) { samples[k] = describeMessageKey(k, (msg as any)[k]); }
    statusRegistry.observeMessageKeys("edited_business_message", keys, samples);
    statusRegistry.observeEntityTypes("edited_business_message", uniqTypes);
    const kb = buildInlineKeyboardForMessage("edited_business_message", keys, uniqTypes, statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev", samples);
    
    const summary = [
      "✏️ Зафіксовано редагування бізнес-повідомлення:",
      `- scope: edited_business_message [${scopeStatusEbm}]`,
      keys.length ? `- keys: ${keys.join(", ")}` : "- keys: (none)",
      uniqTypes.length ? `- entity types: ${uniqTypes.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    await ctx.reply(summary, { reply_to_message_id: (msg as any).message_id, reply_markup: kb ?? undefined });
  } catch (e) {
    console.warn("[status-registry] failed to post edited_business_message event", e);
  }
});

// Handle present-action callbacks first
bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery?.data ?? "";
  if (!(data.startsWith("present|") || data.startsWith("presentall|"))) return next();
  const [prefix, id] = data.split("|");
  if (!id || !presentActions.has(id)) {
    if (prefix === "presentall") {
      if (!presentBulkActions.has(id)) {
        await ctx.answerCallbackQuery({ text: "Недійсно або прострочено", show_alert: true });
        return;
      }
    } else {
      await ctx.answerCallbackQuery({ text: "Недійсно або прострочено", show_alert: true });
      return;
    }
  }
  if (prefix === "presentall") {
    const bulk = presentBulkActions.get(id)!;
    if (ctx.from?.id !== bulk.userId) { await ctx.answerCallbackQuery({ text: "Не дозволено", show_alert: true }); return; }
    try {
      for (const p of bulk.items) {
        switch (p.kind) {
          case "photo": await ctx.replyWithPhoto(p.file_id); break;
          case "video": await ctx.replyWithVideo(p.file_id); break;
          case "document": await ctx.replyWithDocument(p.file_id); break;
          case "animation": await ctx.replyWithAnimation(p.file_id); break;
          case "audio": await ctx.replyWithAudio(p.file_id); break;
          case "voice": await ctx.replyWithVoice(p.file_id); break;
          case "video_note": await ctx.replyWithVideoNote(p.file_id); break;
          case "sticker": await ctx.replyWithSticker(p.file_id); break;
        }
      }
      await ctx.answerCallbackQuery();
    } catch {
      await ctx.answerCallbackQuery({ text: "Не вдалося надіслати всі", show_alert: true });
    } finally {
      try { clearTimeout(bulk.timer); } catch {}
      presentBulkActions.delete(id);
    }
  } else {
    const entry = presentActions.get(id)!;
    if (ctx.from?.id !== entry.userId) { await ctx.answerCallbackQuery({ text: "Не дозволено", show_alert: true }); return; }
    try {
      const p = entry.payload;
      switch (p.kind) {
        case "photo": await ctx.replyWithPhoto(p.file_id); break;
        case "video": await ctx.replyWithVideo(p.file_id); break;
        case "document": await ctx.replyWithDocument(p.file_id); break;
        case "animation": await ctx.replyWithAnimation(p.file_id); break;
        case "audio": await ctx.replyWithAudio(p.file_id); break;
        case "voice": await ctx.replyWithVoice(p.file_id); break;
        case "video_note": await ctx.replyWithVideoNote(p.file_id); break;
        case "sticker": await ctx.replyWithSticker(p.file_id); break;
        default: await ctx.answerCallbackQuery({ text: "Тип не підтримується", show_alert: true }); return;
      }
      await ctx.answerCallbackQuery();
    } catch (e) {
      await ctx.answerCallbackQuery({ text: "Не вдалося надіслати", show_alert: true });
    } finally {
      try { clearTimeout(entry.timer); } catch {}
      presentActions.delete(id);
    }
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
  const updatesPref = (process.env.ALLOWED_UPDATES ?? "minimal").toLowerCase();
  const allowed = updatesPref === "all" ? ALL_UPDATES_9_2 : MINIMAL_UPDATES_9_2;
  if (updatesPref === "minimal") {
    console.warn("[startup] ALLOWED_UPDATES=minimal → inline_query не доставлятимуться. Встановіть ALLOWED_UPDATES=all для підтримки inline mode.");
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

// Force regenerate Markdown and persist current registry state
bot.command("registry_refresh", async (ctx) => {
  try {
    statusRegistry.saveNow();
    const md = buildRegistryMarkdown(statusRegistry.snapshot());
    const filePath = "data/entity-registry.md";
    ensureDirFor(filePath);
    writeFileSync(filePath, md, "utf8");
    try {
      await ctx.replyWithDocument(new InputFile(filePath), { caption: "Entity Registry (refreshed)" });
    } catch {
      // Fallback: send as text chunks
      const chunk = 3500;
      for (let i = 0; i < md.length; i += chunk) {
        const part = md.slice(i, i + chunk);
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
// Interactive status change via inline keyboard
bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery?.data ?? "";
  if (!data.startsWith("reg|")) return next();
  const parsed = parseRegCallback(data);
  if (!parsed) return next();
  try {
    const mode = statusRegistry.getMode();
    const msgText = (ctx.callbackQuery.message as any)?.text as string | undefined;
    const present = (() => {
      const res = { scope: parsed.scope, keys: [] as string[], types: [] as string[] };
      if (!msgText) return res;
      const scopeLine = /-\s*scope:\s*([a-z_]+)/i.exec(msgText);
      if (scopeLine) res.scope = scopeLine[1];
      // Support both "keys:" and "нові/необроблені keys:" and "message.keys:"
      const keysLine = /-\s*(?:нові\/[\p{L}]+\s+)?(?:message\.keys|keys):\s*([^\n]+)/iu.exec(msgText) || /-\s*(?:нові\/[\p{L}]+\s+)?keys:\s*([^\n]+)/iu.exec(msgText);
      if (keysLine) res.keys = keysLine[1].split(",").map((s) => s.trim()).filter(Boolean);
      // Support both "entity types:" and "нові/необроблені entity types:"
      const typesLine = /-\s*(?:нові\/[\p{L}]+\s+)?entity types:\s*([^\n]+)/iu.exec(msgText);
      if (typesLine) res.types = typesLine[1].split(",").map((s) => s.trim()).filter(Boolean);
      return res;
    })();

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
    setConfigStatus(kind as any, parsed.scope, parsed.name, status);
    if (parsed.kind === "s") {
      statusRegistry.setScopeStatus(parsed.scope, status);
      // If ignoring a scope, cascade ignore to its keys and types (only within that scope)
      if (status === "ignore") {
        const snap = statusRegistry.snapshot();
        const keys = Object.keys(snap.keysByScope[parsed.scope] ?? {});
        for (const k of keys) statusRegistry.setMessageKeyStatus(parsed.scope, k, "ignore");
        const types = Object.keys(snap.entityTypesByScope[parsed.scope] ?? {});
        for (const t of types) statusRegistry.setEntityTypeStatus(parsed.scope, t, "ignore");
      }
    } else if (parsed.kind === "k" && parsed.name) {
      statusRegistry.setMessageKeyStatus(parsed.scope, parsed.name, status);
    } else if (parsed.kind === "t" && parsed.name) {
      statusRegistry.setEntityTypeStatus(parsed.scope, parsed.name, status);
    }
    scheduleRegistryMarkdownRefresh();
    await ctx.answerCallbackQuery({ text: `Updated: ${label} → ${status}` });

    // Try to update the inline keyboard in place to reflect new statuses
    try {
      let keys: string[] = present.keys.slice();
      let types: string[] = present.types.slice();
      if (parsed.kind === "s" && status === "ignore") {
        // Hide keys/types for this scope when scope ignored
        keys = [];
        types = [];
      }
      // Hide only the item the user just changed
      if (parsed.kind === "k" && parsed.name) {
        keys = keys.filter((k) => k !== parsed.name);
      } else if (parsed.kind === "t" && parsed.name) {
        types = types.filter((t) => t !== parsed.name);
      }
      // Fallback: if we failed to parse any items from message text, use current registry "needs-review" items under this scope
      if (!keys.length && !types.length) {
        const snap = statusRegistry.snapshot();
        keys = Object.entries(snap.keysByScope[parsed.scope] ?? {})
          .filter(([, v]) => (v as any)?.status === "needs-review")
          .map(([k]) => k);
        types = Object.entries(snap.entityTypesByScope[parsed.scope] ?? {})
          .filter(([, v]) => (v as any)?.status === "needs-review")
          .map(([t]) => t);
      }
      // Always filter out processed/ignored to show only actionable items
      {
        const snap = statusRegistry.snapshot();
        keys = keys.filter((k) => (snap.keysByScope[parsed.scope]?.[k]?.status ?? "needs-review") === "needs-review");
        types = types.filter((t) => (snap.entityTypesByScope[parsed.scope]?.[t]?.status ?? "needs-review") === "needs-review");
      }
      const kb = buildInlineKeyboardForMessage(parsed.scope, keys, types, statusRegistry.snapshot(), mode === "debug" ? "debug" : "dev");
      if (kb) await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch (e) {
      // ignore UI update failures silently
    }
  } catch (e) {
    await ctx.answerCallbackQuery({ text: "Failed to update status", show_alert: true });
  }
});

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
    { key: "ALLOWED_UPDATES", def: "minimal", note: "set 'all' for inline queries" },
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
