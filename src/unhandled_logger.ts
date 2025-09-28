import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { categorizeSampleLabel, type SampleLabelCategory } from "./entity_registry.js";

const DATA_DIR = resolve(process.cwd(), "data");
const UNHANDLED_DIR = resolve(DATA_DIR, "unhandled");
const CHANGES_DIR = resolve(DATA_DIR, "handled-changes");
const API_ERRORS_DIR = resolve(DATA_DIR, "api-errors");
const MAX_STRING = 200;
const MAX_OBJECT_KEYS = 15;
const MAX_ARRAY_ITEMS = 5;
const MAX_DEPTH = 2;

interface SnapshotFile {
  label: string;
  signature: string;
  reason: string;
  capturedAt: string;
  shape: string[];
  keys?: string[];
  sample: unknown;
}

interface SnapshotOptions {
  keys?: string[];
  reason?: string;
  category?: SampleLabelCategory;
}

export interface StoredSnapshot {
  label: string;
  signature: string;
  category: SampleLabelCategory;
  filePath: string;
  reason: string;
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

const signatureCache = new Map<string, Set<string>>();

const rememberSignature = (label: string, signature: string) => {
  let set = signatureCache.get(label);
  if (!set) {
    set = new Set<string>();
    signatureCache.set(label, set);
  }
  set.add(signature);
};

const hasSignature = (label: string, signature: string) => {
  const set = signatureCache.get(label);
  return set ? set.has(signature) : false;
};

const collectShapePaths = (value: unknown, depth = 0, prefix = ""): string[] => {
  if (value === null || value === undefined) return [];
  if (depth >= MAX_DEPTH) return [];

  if (Array.isArray(value)) {
    const marker = prefix ? `${prefix}[]` : "[]";
    const paths: string[] = [marker];
    const limit = Math.min(value.length, MAX_ARRAY_ITEMS);
    for (let index = 0; index < limit; index += 1) {
      paths.push(...collectShapePaths(value[index], depth + 1, marker));
    }
    return paths;
  }

  if (typeof value === "object") {
    const result: string[] = [];
    const keys = Object.keys(value as Record<string, unknown>).sort();
    let processed = 0;
    for (const key of keys) {
      if (processed >= MAX_OBJECT_KEYS) {
        result.push(`${prefix ? `${prefix}.` : ""}:[truncated]`);
        break;
      }
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      result.push(childPrefix);
      result.push(...collectShapePaths((value as Record<string, unknown>)[key], depth + 1, childPrefix));
      processed += 1;
    }
    return result;
  }

  return [];
};

const buildSignatureData = (label: string, value: unknown) => {
  const paths = Array.from(new Set(collectShapePaths(value))).sort();
  const hashSource = paths.join("|") || label;
  const signature = createHash("sha1").update(hashSource).digest("hex").slice(0, 12);
  return { signature, shape: paths };
};

const storeSnapshot = (
  label: string,
  source: unknown,
  options: SnapshotOptions,
): StoredSnapshot | null => {
  if (!label || source === null || source === undefined) {
    return null;
  }

  const { signature, shape } = buildSignatureData(label, source);
  if (hasSignature(label, signature)) {
    return null;
  }

  const category = options.category ?? categorizeSampleLabel(label);
  const directory = category === "handled" ? CHANGES_DIR : UNHANDLED_DIR;
  const filename = `${safeLabel(label)}__${signature}.json`;
  const filePath = resolve(directory, filename);

  if (existsSync(filePath)) {
    rememberSignature(label, signature);
    return null;
  }

  const keys = options.keys && options.keys.length ? Array.from(new Set(options.keys)).sort() : undefined;
  const reason = options.reason ?? (keys?.length ? "keys_added" : "shape_changed");

  const payload: SnapshotFile = {
    label,
    signature,
    reason,
    capturedAt: new Date().toISOString(),
    shape,
    keys,
    sample: sanitizeValue(source),
  };

  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  rememberSignature(label, signature);
  console.info(`[samples] Stored snapshot for ${label} (${reason})`);

  return {
    label,
    signature,
    category,
    filePath,
    reason,
  };
};

export const storeUnhandledSample = (
  label: string,
  source: Record<string, unknown> | undefined | null,
  keys: string[],
  options: Omit<SnapshotOptions, "keys"> = {},
): StoredSnapshot | null => {
  if (!label || !source) return null;
  return storeSnapshot(label, source, { ...options, keys });
};

export const storeApiSample = (
  method: string,
  value: unknown,
  keys: string[] = [],
  options: Omit<SnapshotOptions, "keys"> = {},
): StoredSnapshot | null => {
  if (!method) return null;
  const label = `api_${method}`;
  return storeSnapshot(label, value, { ...options, keys });
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
