import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REGISTRY_PATH = resolve(process.cwd(), "data", "entity-registry.json");
const HANDLED_SNAPSHOT_DIR = resolve(process.cwd(), "data", "handled");
const HANDLED_JSON_PATH = resolve(HANDLED_SNAPSHOT_DIR, "registry.json");
const HANDLED_MARKDOWN_PATH = resolve(HANDLED_SNAPSHOT_DIR, "registry.md");

interface RegistryFile {
  updateKeys: string[];
  messageKeys: string[];
  textEntityTypes: string[];
  payloads: Record<string, string[]>;
  apiShapes: Record<string, string[]>;
}

const defaultRegistry: RegistryFile = {
  updateKeys: [
    "callback_query",
    "inline_query",
    "message",
  ],
  messageKeys: [
    "animation",
    "audio",
    "business_connection_id",
    "caption",
    "caption_entities",
    "chat",
    "date",
    "document",
    "entities",
    "forward_origin",
    "from",
    "has_protected_content",
    "link_preview_options",
    "message_id",
    "paid_media",
    "paid_star_count",
    "photo",
    "quoted_message",
    "reply_to_message",
    "sticker",
    "text",
    "via_bot",
    "video",
    "voice",
  ],
  textEntityTypes: [
    "mention",
    "hashtag",
    "cashtag",
    "bot_command",
    "url",
    "email",
    "phone_number",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "spoiler",
    "code",
    "pre",
    "text_link",
    "text_mention",
    "custom_emoji",
    "blockquote",
    "expandable_blockquote",
  ],
  payloads: {
    "payload:update.message": [
      "business_connection_id",
      "chat",
      "date",
      "entities",
      "forward_origin",
      "from",
      "message_id",
      "reply_to_message",
      "text",
      "via_bot",
    ],
    "payload:update.callback_query": [
      "chat_instance",
      "data",
      "from",
      "game_short_name",
      "id",
      "inline_message_id",
      "message",
    ],
    "payload:update.inline_query": [
      "chat_type",
      "from",
      "id",
      "offset",
      "query",
    ],
    "payload:update.edited_message": [
      "chat",
      "date",
      "edit_date",
      "from",
      "message_id",
      "text",
    ],
    "payload:callback_query": [
      "chat_instance",
      "data",
      "from",
      "game_short_name",
      "id",
      "inline_message_id",
      "message",
    ],
    "payload:callback_query.message": [
      "chat",
      "date",
      "entities",
      "from",
      "message_id",
      "reply_to_message",
      "text",
    ],
    "payload:inline_query": [
      "chat_type",
      "from",
      "id",
      "offset",
      "query",
    ],
    "payload:message.business_connection": [
      "id",
    ],
    "payload:message.forward_origin": [
      "chat",
      "signature",
      "type",
      "user",
    ],
    "payload:message.link_preview_options": [
      "is_disabled",
      "prefer_large_media",
      "prefer_small_media",
      "show_above_text",
      "url",
    ],
    "payload:message.reaction": [
      "emoji",
      "type",
    ],
    "payload:message.reactions": [
      "recent_sender_chat",
      "recent_sender_name",
      "type",
      "user",
    ],
    "payload:message.reply_to_message": [
      "chat",
      "date",
      "from",
      "message_id",
      "text",
    ],
  },
  apiShapes: {
    "api:answerCallbackQuery": [
      "ok",
      "result",
    ],
    "api:answerInlineQuery": [
      "ok",
      "result",
    ],
    "api:deleteWebhook": [
      "description",
      "ok",
      "result",
    ],
    "api:getMe": [
      "ok",
      "result",
    ],
    "api:getUpdates": [
      "ok",
      "result",
    ],
    "api:sendMessage": [
      "ok",
      "result",
    ],
  },
};

let registry: RegistryFile = defaultRegistry;

try {
  if (existsSync(REGISTRY_PATH)) {
    const content = readFileSync(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(content) as Partial<RegistryFile>;
    registry = {
      updateKeys: Array.isArray(parsed.updateKeys) ? parsed.updateKeys : defaultRegistry.updateKeys,
      messageKeys: Array.isArray(parsed.messageKeys) ? parsed.messageKeys : defaultRegistry.messageKeys,
      textEntityTypes: Array.isArray(parsed.textEntityTypes)
        ? Array.from(new Set([...defaultRegistry.textEntityTypes, ...parsed.textEntityTypes]))
        : defaultRegistry.textEntityTypes,
      payloads: parsed.payloads && typeof parsed.payloads === "object" ? parsed.payloads : defaultRegistry.payloads,
      apiShapes: parsed.apiShapes && typeof parsed.apiShapes === "object" ? parsed.apiShapes : defaultRegistry.apiShapes,
    };
  }
} catch (error) {
  console.warn("[registry] Не вдалося прочитати entity-registry.json, використовуємо значення за замовчуванням", error);
}

const updateKeySet = new Set(registry.updateKeys);
const messageKeySet = new Set(registry.messageKeys);
const textEntitySet = new Set(registry.textEntityTypes);
const payloadKeySets = new Map<string, Set<string>>();
const apiShapeSets = new Map<string, Set<string>>();

for (const [label, keys] of Object.entries(registry.payloads)) {
  payloadKeySets.set(label, new Set(keys));
}

for (const [label, keys] of Object.entries(registry.apiShapes)) {
  apiShapeSets.set(label, new Set(keys));
}

const ensureParentDir = (filePath: string) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

const sortArray = (items: Iterable<string>) => Array.from(new Set(items)).sort();

const writeHandledSnapshot = () => {
  const generatedAt = new Date().toISOString();

  const payloads: Record<string, string[]> = {};
  const payloadLabels = Array.from(payloadKeySets.keys()).sort();
  for (const label of payloadLabels) {
    const set = payloadKeySets.get(label);
    if (!set) continue;
    payloads[label.replace(/^payload:/, "")] = sortArray(set);
  }

  const apiShapes: Record<string, string[]> = {};
  const apiLabels = Array.from(apiShapeSets.keys()).sort();
  for (const label of apiLabels) {
    const set = apiShapeSets.get(label);
    if (!set) continue;
    apiShapes[label.replace(/^api:/, "")] = sortArray(set);
  }

  const snapshot = {
    generatedAt,
    updateKeys: sortArray(updateKeySet),
    messageKeys: sortArray(messageKeySet),
    textEntityTypes: sortArray(textEntitySet),
    payloads,
    apiShapes,
  };

  ensureParentDir(HANDLED_JSON_PATH);
  writeFileSync(HANDLED_JSON_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const lines: string[] = [];
  lines.push("# Handled Registry Snapshot");
  lines.push("");
  lines.push(`Generated at: ${generatedAt}`);
  lines.push("");

  lines.push("## Update Keys");
  lines.push(snapshot.updateKeys.length ? snapshot.updateKeys.map((key) => `- ${key}`).join("\n") : "- (none)");
  lines.push("");

  lines.push("## Message Keys");
  lines.push(snapshot.messageKeys.length ? snapshot.messageKeys.map((key) => `- ${key}`).join("\n") : "- (none)");
  lines.push("");

  lines.push("## Text Entity Types");
  lines.push(snapshot.textEntityTypes.length ? snapshot.textEntityTypes.map((key) => `- ${key}`).join("\n") : "- (none)");
  lines.push("");

  lines.push("## Payload Buckets");
  if (!payloadLabels.length) {
    lines.push("- (none)");
  } else {
    for (const label of payloadLabels) {
      const cleanLabel = label.replace(/^payload:/, "");
      const keys = payloads[cleanLabel] ?? [];
      lines.push(`- ${cleanLabel}`);
      if (keys.length) {
        for (const key of keys) {
          lines.push(`  - ${key}`);
        }
      } else {
        lines.push("  - (no keys tracked)");
      }
    }
  }
  lines.push("");

  lines.push("## API Shapes");
  if (!apiLabels.length) {
    lines.push("- (none)");
  } else {
    for (const label of apiLabels) {
      const cleanLabel = label.replace(/^api:/, "");
      const keys = apiShapes[cleanLabel] ?? [];
      lines.push(`- ${cleanLabel}`);
      if (keys.length) {
        for (const key of keys) {
          lines.push(`  - ${key}`);
        }
      } else {
        lines.push("  - (no keys tracked)");
      }
    }
  }

  lines.push("");

  ensureParentDir(HANDLED_MARKDOWN_PATH);
  writeFileSync(HANDLED_MARKDOWN_PATH, `${lines.join("\n")}\n`, "utf8");
};

const persist = () => {
  ensureParentDir(REGISTRY_PATH);

  const payloads: Record<string, string[]> = {};
  for (const [label, set] of payloadKeySets.entries()) {
    payloads[label] = Array.from(set).sort();
  }

  const apiShapes: Record<string, string[]> = {};
  for (const [label, set] of apiShapeSets.entries()) {
    apiShapes[label] = Array.from(set).sort();
  }

  const data: RegistryFile = {
    updateKeys: Array.from(updateKeySet).sort(),
    messageKeys: Array.from(messageKeySet).sort(),
    textEntityTypes: Array.from(textEntitySet).sort(),
    payloads,
    apiShapes,
  };

  writeFileSync(REGISTRY_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeHandledSnapshot();
};

writeHandledSnapshot();

export type SampleLabelCategory = "handled" | "unknown";

export const categorizeSampleLabel = (label: string): SampleLabelCategory => {
  if (!label) return "unknown";
  if (label === "update") return updateKeySet.size ? "handled" : "unknown";
  if (label === "message") return messageKeySet.size ? "handled" : "unknown";

  if (label.startsWith("api_")) {
    const method = label.slice(4);
    return apiShapeSets.has(`api:${method}`) ? "handled" : "unknown";
  }

  const payloadLabel = label.startsWith("payload:") ? label : `payload:${label}`;
  if (payloadKeySets.has(payloadLabel)) return "handled";

  return "unknown";
};

const logNewItems = (label: string, items: string[]) => {
  if (!items.length) return;
  console.info(`[registry] Нові ${label}: ${items.join(", ")}`);
};

export const recordUpdateKeys = (keys: string[]): string[] => {
  const newKeys: string[] = [];
  for (const key of keys) {
    if (!updateKeySet.has(key)) {
      updateKeySet.add(key);
      newKeys.push(key);
    }
  }
  if (newKeys.length) {
    persist();
    logNewItems("update keys", newKeys);
  }
  return newKeys;
};

export const recordMessageKeys = (keys: string[]): string[] => {
  const newKeys: string[] = [];
  for (const key of keys) {
    if (!messageKeySet.has(key)) {
      messageKeySet.add(key);
      newKeys.push(key);
    }
  }
  if (newKeys.length) {
    persist();
    logNewItems("message keys", newKeys);
  }
  return newKeys;
};

export const recordEntityType = (type: string): boolean => {
  if (!type) return false;
  if (textEntitySet.has(type)) return false;
  textEntitySet.add(type);
  persist();
  logNewItems("entity types", [type]);
  return true;
};

const recordBucketKeys = (
  bucket: Map<string, Set<string>>,
  label: string,
  keys: string[],
): string[] => {
  if (!label || !keys.length) return [];

  let set = bucket.get(label);
  if (!set) {
    set = new Set<string>();
    bucket.set(label, set);
  }

  const newKeys: string[] = [];
  for (const key of keys) {
    if (!set.has(key)) {
      set.add(key);
      newKeys.push(key);
    }
  }

  if (!newKeys.length) return [];
  persist();
  logNewItems(label, newKeys);
  return newKeys;
};

export const recordPayloadKeys = (label: string, keys: string[]): string[] => {
  return recordBucketKeys(payloadKeySets, `payload:${label}`, keys);
};

export const recordCallbackKeys = (keys: string[]): string[] => {
  return recordPayloadKeys("callback_query", keys);
};

export const recordInlineQueryKeys = (keys: string[]): string[] => {
  return recordPayloadKeys("inline_query", keys);
};

export const recordApiShape = (method: string, value: unknown): string[] => {
  if (!method) return [];

  const keys: string[] = [];

  if (Array.isArray(value)) {
    keys.push("[array]");
    const sample = value.find((item) => item && typeof item === "object" && !Array.isArray(item));
    if (sample && typeof sample === "object") {
      for (const key of Object.keys(sample)) {
        keys.push(`item.${key}`);
      }
    }
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      keys.push(key);
    }
  } else {
    keys.push(`[${typeof value}]`);
  }

  if (!keys.length) return [];
  return recordBucketKeys(apiShapeSets, `api:${method}`, keys);
};

export const snapshotSets = () => ({
  updateKeySet,
  messageKeySet,
  textEntitySet,
  payloadKeySets,
  apiShapeSets,
});
