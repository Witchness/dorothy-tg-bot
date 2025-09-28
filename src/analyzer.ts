import type { Message, MessageEntity, MessageOrigin } from "grammy/types";
import { recordEntityType, recordMessageKeys, recordPayloadKeys } from "./entity_registry.js";
import { storeUnhandledSample } from "./unhandled_logger.js";

interface EntityBuckets {
  commands: string[];
  mentions: string[];
  hashtags: string[];
  cashtags: string[];
  urls: string[];
  emails: string[];
  phones: string[];
}

interface AttachmentSummary {
  label: string;
}

export interface AnalysisSummary {
  textSection?: string;
  nlpSection?: string[];
  entitiesSection?: string[];
  linkInsights?: string[];
  attachments?: AttachmentSummary[];
  meta?: string[];
  service?: string[];
  alerts?: string[];
}

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const hasProp = <K extends PropertyKey>(value: unknown, property: K): value is Record<K, unknown> => {
  return typeof value === "object" && value !== null && property in value;
};

const formatBytes = (size?: number | string) => {
  if (!size) return "";
  const value = typeof size === "string" ? Number(size) : size;
  if (!value || Number.isNaN(value)) return "";
  if (value < 1024) return `${value} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let current = value / 1024;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(1)} ${units[index]}`;
};

const registerPayload = (label: string, payload: unknown, alerts: string[]) => {
  if (!payload) return;
  if (Array.isArray(payload)) {
    const sample = payload.find((item) => typeof item === "object" && item !== null && !Array.isArray(item));
    if (sample) {
      const target = asRecord(sample);
      const keys = Object.keys(target);
      const newKeys = recordPayloadKeys(label, keys);
      const snapshot = storeUnhandledSample(label, target, newKeys);
      if (newKeys.length) {
        alerts.push(`New payload keys for ${label}: ${newKeys.join(", ")}`);
      } else if (snapshot) {
        alerts.push(`New payload shape detected for ${label} (${snapshot.signature})`);
      }
    }
    return;
  }
  if (typeof payload !== "object") return;
  const record = asRecord(payload);
  const keys = Object.keys(record);
  const newKeys = recordPayloadKeys(label, keys);
  const snapshot = storeUnhandledSample(label, record, newKeys);
  if (newKeys.length) {
    alerts.push(`New payload keys for ${label}: ${newKeys.join(", ")}`);
  } else if (snapshot) {
    alerts.push(`New payload shape detected for ${label} (${snapshot.signature})`);
  }
};

const sliceEntityText = (entity: MessageEntity, source: string) => {
  const { offset, length } = entity;
  return source.substring(offset, offset + length);
};

const collectEntities = (
  text: string,
  entities: MessageEntity[] | undefined,
  alerts: string[],
): EntityBuckets => {
  const buckets: EntityBuckets = {
    commands: [],
    mentions: [],
    hashtags: [],
    cashtags: [],
    urls: [],
    emails: [],
    phones: [],
  };

  if (!text || !entities) return buckets;

  for (const entity of entities) {
    const value = sliceEntityText(entity, text);
    const isNewType = recordEntityType(entity.type);
    if (isNewType) alerts.push(`New entity type observed: ${entity.type}`);
    switch (entity.type) {
      case "bot_command":
        buckets.commands.push(value);
        break;
      case "mention":
        buckets.mentions.push(value);
        break;
      case "hashtag":
        buckets.hashtags.push(value);
        break;
      case "cashtag":
        buckets.cashtags.push(value);
        break;
      case "url":
        buckets.urls.push(value);
        break;
      case "email":
        buckets.emails.push(value);
        break;
      case "phone_number":
        buckets.phones.push(value);
        break;
      case "text_link":
        if ("url" in entity && entity.url) buckets.urls.push(entity.url);
        break;
      default:
        break;
    }
  }

  return buckets;
};

const describeForwardOrigin = (origin: MessageOrigin): string | undefined => {
  switch (origin.type) {
    case "user":
      return `Переслано від користувача ${origin.sender_user?.first_name ?? "(ім'я приховано)"}`;
    case "chat": {
      const chat = hasProp(origin, "sender_chat") ? origin.sender_chat : undefined;
      const title = hasProp(chat, "title") ? (chat.title as string) : undefined;
      const username = hasProp(chat, "username") ? (chat.username as string) : undefined;
      return `Переслано з чату ${title ?? username ?? "невідомо"}`;
    }
    case "channel": {
      const chat = hasProp(origin, "chat") ? origin.chat : undefined;
      const title = hasProp(chat, "title") ? (chat.title as string) : undefined;
      const username = hasProp(chat, "username") ? (chat.username as string) : undefined;
      return `Переслано з каналу ${title ?? username ?? "невідомо"}`;
    }
    case "hidden_user":
      return "Переслано від прихованого користувача";
    default:
      return undefined;
  }
};

const describeReply = (message: Message): string | undefined => {
  if (!message.reply_to_message) return undefined;
  const replied = message.reply_to_message;
  const base = replied.text ?? replied.caption ?? replied.poll?.question;
  if (!base) return "Відповідь на попереднє повідомлення";
  const preview = base.length > 60 ? `${base.slice(0, 57)}…` : base;
  return `Відповідь на: "${preview}"`;
};

const describeThread = (message: Message): string | undefined => {
  if (!message.message_thread_id) return undefined;
  return `Thread ID: ${message.message_thread_id}`;
};

const summarizeText = (text: string): string | undefined => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= 160) return `Summary: ${cleaned}`;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!sentences.length) return `Summary: ${cleaned.slice(0, 157)}…`;
  const summary = sentences.slice(0, 2).join(" ");
  return `Summary: ${summary.length > 160 ? `${summary.slice(0, 157)}…` : summary}`;
};

const detectLanguage = (text: string): string | undefined => {
  const cleaned = text.replace(/[^A-Za-zА-Яа-яЇїІіЄєҐґ]/g, "");
  if (cleaned.length < 10) return undefined;
  let latin = 0;
  let cyrillic = 0;
  for (const char of cleaned) {
    if (/[A-Za-z]/.test(char)) latin += 1;
    else if (/[А-Яа-яЇїІіЄєҐґ]/.test(char)) cyrillic += 1;
  }
  if (latin === 0 && cyrillic === 0) return undefined;
  if (cyrillic > latin * 1.2) return "Language guess: Ukrainian (Cyrillic dominant)";
  if (latin > cyrillic * 1.2) return "Language guess: English/Latin";
  return "Language guess: mixed";
};

const buildLinkInsights = (urls: string[]): string[] => {
  const insights: string[] = [];
  for (const raw of urls) {
    let formatted = raw;
    if (!/^https?:\/\//i.test(formatted)) formatted = `https://${formatted}`;
    try {
      const url = new URL(formatted);
      const host = url.hostname;
      const path = url.pathname && url.pathname !== "/" ? url.pathname : "root";
      const note = `Link → ${host} (${path})`;
      insights.push(note);
    } catch {
      insights.push(`Link → ${raw}`);
    }
  }
  return insights;
};

const buildAttachmentSummary = (message: Message, alerts: string[]): AttachmentSummary[] => {
  const attachments: AttachmentSummary[] = [];

  if (message.photo?.length) {
    registerPayload("message.photo", message.photo, alerts);
    const photo = message.photo.at(-1);
    if (photo) {
      const size = formatBytes(photo.file_size);
      const dims = photo.width && photo.height ? `${photo.width}×${photo.height}` : "";
      attachments.push({ label: `Фото ${dims}${size ? ` (${size})` : ""}`.trim() });
    }
  }

  if (message.document) {
    registerPayload("message.document", message.document, alerts);
    const doc = message.document;
    const name = doc.file_name ?? "Документ";
    const size = formatBytes(doc.file_size);
    const mime = doc.mime_type ? `, ${doc.mime_type}` : "";
    attachments.push({ label: `${name}${mime}${size ? ` (${size})` : ""}`.trim() });
  }

  if (message.video) {
    registerPayload("message.video", message.video, alerts);
    const video = message.video;
    const size = formatBytes(video.file_size);
    const dims = video.width && video.height ? `${video.width}×${video.height}` : "";
    attachments.push({ label: `Відео ${dims}${size ? ` (${size})` : ""}`.trim() });
  }

  if (message.animation) {
    registerPayload("message.animation", message.animation, alerts);
    const anim = message.animation;
    const size = formatBytes(anim.file_size);
    const dims = anim.width && anim.height ? `${anim.width}×${anim.height}` : "";
    attachments.push({ label: `GIF ${dims}${size ? ` (${size})` : ""}`.trim() });
  }

  if (message.audio) {
    registerPayload("message.audio", message.audio, alerts);
    const audio = message.audio;
    const size = formatBytes(audio.file_size);
    const performer = audio.performer ? `${audio.performer} — ` : "";
    attachments.push({ label: `Аудіо ${performer}${audio.title ?? ""}${size ? ` (${size})` : ""}`.trim() });
  }

  if (message.voice) {
    registerPayload("message.voice", message.voice, alerts);
    const voice = message.voice;
    const size = formatBytes(voice.file_size);
    attachments.push({ label: `Голосове повідомлення${size ? ` (${size})` : ""}`.trim() });
  }

  if (message.video_note) {
    registerPayload("message.video_note", message.video_note, alerts);
    attachments.push({ label: "Відео-нотатка" });
  }

  if (message.sticker) {
    registerPayload("message.sticker", message.sticker, alerts);
    const sticker = message.sticker;
    const emoji = sticker.emoji ? ` ${sticker.emoji}` : "";
    attachments.push({ label: `Стікер${emoji}` });
  }

  if (message.contact) {
    registerPayload("message.contact", message.contact, alerts);
    const contact = message.contact;
    const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Контакт";
    attachments.push({ label: `Контакт: ${name}` });
  }

  if (message.location) {
    registerPayload("message.location", message.location, alerts);
    const { latitude, longitude } = message.location;
    attachments.push({ label: `Локація: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}` });
  }

  if (message.venue) {
    registerPayload("message.venue", message.venue, alerts);
    const venue = message.venue;
    attachments.push({ label: `Місце: ${venue.title} (${venue.address})` });
  }

  if (message.poll) {
    registerPayload("message.poll", message.poll, alerts);
    attachments.push({ label: `Опитування: ${message.poll.question}` });
  }

  if (message.story) {
    registerPayload("message.story", message.story, alerts);
    attachments.push({ label: "Story" });
  }

  if (hasProp(message, "reply_to_story")) {
    registerPayload("message.reply_to_story", message.reply_to_story, alerts);
    attachments.push({ label: "Reply to story" });
  }

  if (message.dice) {
    registerPayload("message.dice", message.dice, alerts);
    attachments.push({ label: `Кубик: ${message.dice.emoji} → ${message.dice.value}` });
  }

  if (hasProp(message, "giveaway")) {
    registerPayload("message.giveaway", message.giveaway, alerts);
    attachments.push({ label: "Giveaway" });
  }

  if (message.paid_media) {
    registerPayload("message.paid_media", message.paid_media, alerts);
    attachments.push({ label: "Платний контент" });
  }

  return attachments;
};

export const analyzeMessage = (message: Message): AnalysisSummary => {
  const result: AnalysisSummary = {};
  const alerts: string[] = [];

  const messageRecord = asRecord(message);
  const messageKeys = Object.keys(messageRecord).filter((key) => {
    const value = messageRecord[key];
    if (typeof value === "function") return false;
    return value !== null && value !== undefined;
  });
  const newMessageKeys = recordMessageKeys(messageKeys);
  const messageSnapshot = storeUnhandledSample("message", messageRecord, newMessageKeys);
  if (newMessageKeys.length) {
    alerts.push(`New message keys observed: ${newMessageKeys.join(", ")}`);
  } else if (messageSnapshot) {
    alerts.push(`New message shape detected (${messageSnapshot.signature})`);
  }

  if (message.reply_to_message) {
    registerPayload("message.reply_to_message", message.reply_to_message, alerts);
  }
  if (message.forward_origin) {
    registerPayload("message.forward_origin", message.forward_origin, alerts);
  }
  if (hasProp(message, "reactions")) {
    registerPayload("message.reactions", messageRecord.reactions, alerts);
  }
  if (hasProp(message, "reaction")) {
    registerPayload("message.reaction", messageRecord.reaction, alerts);
  }
  if (message.link_preview_options) {
    registerPayload("message.link_preview_options", message.link_preview_options, alerts);
  }
  if (hasProp(message, "business_connection_id")) {
    registerPayload("message.business_connection", { id: messageRecord.business_connection_id }, alerts);
  }

  const text = message.text ?? message.caption ?? "";
  const textEntities = message.entities ?? message.caption_entities;

  if (text) {
    const characters = text.length;
    const lines = text.split(/\r?\n/).length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    result.textSection = `📝 Текст: ${characters} символів, ${words} слів, ${lines} рядків`;
    const buckets = collectEntities(text, textEntities ?? undefined, alerts);
    const entityLines: string[] = [];
    if (buckets.commands.length) entityLines.push(`Команди: ${buckets.commands.join(", ")}`);
    if (buckets.urls.length) entityLines.push(`Посилання: ${buckets.urls.join(", ")}`);
    if (buckets.mentions.length) entityLines.push(`Згадки: ${buckets.mentions.join(", ")}`);
    if (buckets.hashtags.length) entityLines.push(`Хештеги: ${buckets.hashtags.join(", ")}`);
    if (buckets.cashtags.length) entityLines.push(`Cashtags: ${buckets.cashtags.join(", ")}`);
    if (buckets.emails.length) entityLines.push(`Email: ${buckets.emails.join(", ")}`);
    if (buckets.phones.length) entityLines.push(`Телефони: ${buckets.phones.join(", ")}`);
    if (entityLines.length) result.entitiesSection = entityLines;

    const nlpLines: string[] = [];
    const summary = summarizeText(text);
    if (summary) nlpLines.push(summary);
    const language = detectLanguage(text);
    if (language) nlpLines.push(language);
    if (nlpLines.length) result.nlpSection = nlpLines;

    const linkInsights = buildLinkInsights(buckets.urls);
    if (linkInsights.length) result.linkInsights = linkInsights;
  }

  const attachments = buildAttachmentSummary(message, alerts);
  if (attachments.length) {
    result.attachments = attachments;
  }

  const meta: string[] = [];
  if (message.forward_origin) {
    const info = describeForwardOrigin(message.forward_origin);
    if (info) meta.push(info);
  }
  const reply = describeReply(message);
  if (reply) meta.push(reply);
  const thread = describeThread(message);
  if (thread) meta.push(thread);
  if (message.via_bot) meta.push(`Надіслано через бота @${message.via_bot.username ?? "unknown"}`);
  if (message.link_preview_options) meta.push("Link preview: custom налаштування");
  if (meta.length) result.meta = meta;

  const service: string[] = [];
  if (hasProp(message, "business_connection_id")) service.push("Бізнес-повідомлення");
  if (hasProp(message, "paid_star_count")) service.push(`Оплачено Stars: ${messageRecord.paid_star_count}`);
  if (hasProp(message, "reaction")) service.push("Реакції присутні");
  if (hasProp(message, "reactions")) service.push("Підрахунок реакцій");
  if (hasProp(message, "checklist")) service.push("Checklist payload");
  if (hasProp(message, "checklist_completed")) service.push("Checklist завершено");
  if (service.length) result.service = service;

  if (!result.textSection && !result.entitiesSection && !result.attachments && !result.meta && !result.service) {
    result.textSection = "Повідомлення не містить даних для аналізу.";
  }

  if (alerts.length) {
    result.alerts = alerts;
  }

  return result;
};

export const formatAnalysis = (summary: AnalysisSummary): string => {
  const lines: string[] = [];
  if (summary.textSection) lines.push(summary.textSection);
  if (summary.nlpSection) {
    lines.push("🧠 Insights:");
    for (const line of summary.nlpSection) lines.push(`• ${line}`);
  }
  if (summary.entitiesSection) {
    for (const line of summary.entitiesSection) lines.push(`• ${line}`);
  }
  if (summary.linkInsights?.length) {
    lines.push("🔗 Links:");
    for (const item of summary.linkInsights) lines.push(`• ${item}`);
  }
  if (summary.attachments?.length) {
    lines.push("📎 Вкладення:");
    for (const attachment of summary.attachments) lines.push(`• ${attachment.label}`);
  }
  if (summary.meta?.length) {
    lines.push("ℹ️ Мета:");
    for (const item of summary.meta) lines.push(`• ${item}`);
  }
  if (summary.service?.length) {
    lines.push("⚙️ Службова інформація:");
    for (const item of summary.service) lines.push(`• ${item}`);
  }
  return lines.join("\n");
};
