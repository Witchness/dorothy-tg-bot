import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REGISTRY_PATH = resolve(process.cwd(), "data", "entity-registry.json");

interface RegistryFile {
  updateKeys: string[];
  messageKeys: string[];
  textEntityTypes: string[];
  payloads: Record<string, string[]>;
  apiShapes: Record<string, string[]>;
}

const defaultRegistry: RegistryFile = {
  updateKeys: [],
  messageKeys: [],
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
  payloads: {},
  apiShapes: {},
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

const persist = () => {
  const dir = dirname(REGISTRY_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

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
