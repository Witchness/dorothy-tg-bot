import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_DIR = resolve(process.cwd(), "data", "unhandled");
const MAX_STRING = 200;
const MAX_OBJECT_KEYS = 15;
const MAX_ARRAY_ITEMS = 5;
const MAX_DEPTH = 2;

interface SampleFile {
  label: string;
  capturedAt: string;
  samples: Record<string, unknown>;
}

const ensureDir = (filePath: string) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

const safeLabel = (label: string) => label.replace(/[^a-z0-9_.-]+/gi, "_");

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") {
    if (value.length <= MAX_STRING) return value;
    return `${value.slice(0, MAX_STRING)}… (truncated)`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      slice.push("…(truncated)" as unknown);
    }
    return slice;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (count >= MAX_OBJECT_KEYS) {
        result["…"] = "[truncated]";
        break;
      }
      result[key] = sanitizeValue((value as Record<string, unknown>)[key], depth + 1);
      count += 1;
    }
    return result;
  }

  return `[${typeof value}]`;
};

export const storeUnhandledSample = (
  label: string,
  source: Record<string, unknown> | undefined | null,
  keys: string[],
) => {
  if (!label || !source || !keys.length) return;

  const filename = `${safeLabel(label)}.json`;
  const filePath = resolve(BASE_DIR, filename);

  let samples: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content) as SampleFile;
      if (parsed && typeof parsed === "object" && parsed.samples) {
        samples = parsed.samples;
      }
    } catch (error) {
      console.warn(`[samples] Не вдалося прочитати ${filename}:`, error);
    }
  }

  let changed = false;
  for (const key of keys) {
    if (key in samples) continue;
    // Не намагаємося розгортати складні ключі з крапками типу item.field
    if (key.includes(".")) continue;
    const value = (source as Record<string, unknown>)[key];
    samples[key] = sanitizeValue(value);
    changed = true;
  }

  if (!changed) return;

  ensureDir(filePath);
  const payload: SampleFile = {
    label,
    capturedAt: new Date().toISOString(),
    samples,
  };

  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.info(`[samples] Додано приклади для ${label}: ${keys.join(", ")}`);
};

export const storeApiSample = (method: string, value: unknown) => {
  if (!method) return;
  const label = `api_${method}`;
  const filename = `${safeLabel(label)}.json`;
  const filePath = resolve(BASE_DIR, filename);
  if (existsSync(filePath)) return; // один приклад достатній

  ensureDir(filePath);
  const payload = {
    method,
    capturedAt: new Date().toISOString(),
    sample: sanitizeValue(value),
  };

  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.info(`[samples] Збережено API-відповідь для ${method}`);
};
