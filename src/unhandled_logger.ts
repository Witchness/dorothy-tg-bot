import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { categorizeSampleLabel } from "./entity_registry.js";

const DATA_DIR = resolve(process.cwd(), "data");
const UNHANDLED_DIR = resolve(DATA_DIR, "unhandled");
const CHANGES_DIR = resolve(DATA_DIR, "handled-changes");
const API_ERRORS_DIR = resolve(DATA_DIR, "api-errors");
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

const resolveSamplePath = (label: string, filename: string) => {
  const bucket = categorizeSampleLabel(label) === "handled" ? CHANGES_DIR : UNHANDLED_DIR;
  return resolve(bucket, filename);
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
  const filePath = resolveSamplePath(label, filename);

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
  const filePath = resolveSamplePath(label, filename);
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

interface ApiErrorSnapshot {
  capturedAt: string;
  description: string;
  code?: number;
  parameters?: unknown;
  payload?: unknown;
  message?: string;
}

interface ApiErrorFile {
  method: string;
  errors: ApiErrorSnapshot[];
}

const buildErrorSignature = (snapshot: ApiErrorSnapshot) => {
  return JSON.stringify({ description: snapshot.description, payload: snapshot.payload });
};

export const storeApiError = (method: string, payload: unknown, error: unknown) => {
  if (!method || !error) return;

  const filename = `${safeLabel(`api_error_${method}`)}.json`;
  const filePath = resolve(API_ERRORS_DIR, filename);

  let existing: ApiErrorFile | undefined;
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, "utf8");
      existing = JSON.parse(raw) as ApiErrorFile;
    } catch (parseError) {
      console.warn(`[api-error] Failed to parse ${filename}:`, parseError);
    }
  }

  const safePayload = sanitizeValue(payload);
  const description =
    typeof error === "object" && error && "description" in error && typeof (error as Record<string, unknown>).description === "string"
      ? ((error as Record<string, unknown>).description as string)
      : error instanceof Error
        ? error.message
        : String(error);
  const code =
    typeof error === "object" && error && "error_code" in error && typeof (error as Record<string, unknown>).error_code === "number"
      ? ((error as Record<string, unknown>).error_code as number)
      : undefined;
  const parameters =
    typeof error === "object" && error && "parameters" in error
      ? sanitizeValue((error as Record<string, unknown>).parameters)
      : undefined;
  const message = error instanceof Error ? error.message : undefined;

  const snapshot: ApiErrorSnapshot = {
    capturedAt: new Date().toISOString(),
    description,
    code,
    parameters,
    payload: safePayload,
    message,
  };

  const errors = existing?.errors ?? [];
  const signature = buildErrorSignature(snapshot);
  const alreadyLogged = errors.some((entry) => buildErrorSignature(entry) === signature);
  if (alreadyLogged) return;

  errors.unshift(snapshot);
  const limited = errors.slice(0, 10);

  const payloadToWrite: ApiErrorFile = {
    method,
    errors: limited,
  };

  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(payloadToWrite, null, 2)}\n`, "utf8");
  console.info(`[api-error] Captured API error for ${method}: ${description}`);
};
