import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Status = "process" | "ignore" | "needs-review";

export interface ItemEntry {
  status: Status;
  seen: number;
  firstSeen: string;
  lastSeen: string;
  sample?: string;
}

export interface StatusRegistryFile {
  version: 1;
  updatedAt: string;
  scopes: Record<string, ItemEntry>;
  messageKeys: Record<string, ItemEntry>;
  entityTypes: Record<string, ItemEntry>;
}

export interface ScopeDiffItem { scope: string; status: Status }
export interface KeyDiffItem { key: string; status: Status; sample?: string }
export interface EntityTypeDiffItem { type: string; status: Status }

const STATUS_PATH = resolve(process.cwd(), "data", "registry-status.json");
const HANDLED_SNAPSHOT_JSON = resolve(process.cwd(), "data", "handled", "registry.json");

const nowIso = () => new Date().toISOString();

const ensureParentDir = (filePath: string) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

function defaultFile(): StatusRegistryFile {
  return {
    version: 1,
    updatedAt: nowIso(),
    scopes: {},
    messageKeys: {},
    entityTypes: {},
  };
}

function stable<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = stable(v as Record<string, unknown>);
    else out[k] = v as unknown;
  }
  return out as T;
}

export class RegistryStatus {
  private filePath: string;
  private data: StatusRegistryFile;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private throttleMs: number;

  constructor(path: string = STATUS_PATH, throttleMs = 1500) {
    this.filePath = path;
    this.throttleMs = throttleMs;
    this.data = this.load();
  }

  private load(): StatusRegistryFile {
    // If file exists, load it
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf8");
        const parsed = JSON.parse(raw) as StatusRegistryFile;
        if (parsed && parsed.scopes && parsed.messageKeys && parsed.entityTypes) return parsed;
      }
    } catch {
      // fallthrough
    }

    // Seed from handled snapshot if present
    const seeded = defaultFile();
    try {
      if (existsSync(HANDLED_SNAPSHOT_JSON)) {
        const raw = readFileSync(HANDLED_SNAPSHOT_JSON, "utf8");
        const snapshot = JSON.parse(raw) as {
          updateKeys?: string[];
          messageKeys?: string[];
          textEntityTypes?: string[];
        };
        const ts = nowIso();
        for (const scope of snapshot.updateKeys ?? []) {
          seeded.scopes[scope] = { status: "process", seen: 0, firstSeen: ts, lastSeen: ts };
        }
        for (const key of snapshot.messageKeys ?? []) {
          seeded.messageKeys[key] = { status: "process", seen: 0, firstSeen: ts, lastSeen: ts };
        }
        for (const type of snapshot.textEntityTypes ?? []) {
          seeded.entityTypes[type] = { status: "process", seen: 0, firstSeen: ts, lastSeen: ts };
        }
      }
    } catch {
      // ignore
    }

    ensureParentDir(this.filePath);
    writeFileSync(this.filePath, `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
    return seeded;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, this.throttleMs);
  }

  public saveNow(): void {
    this.data.updatedAt = nowIso();
    const sorted = stable(this.data as unknown as Record<string, unknown>) as unknown as StatusRegistryFile;
    ensureParentDir(this.filePath);
    writeFileSync(this.filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  }

  public snapshot(): StatusRegistryFile {
    return JSON.parse(JSON.stringify(this.data));
  }

  private ensureScope(scope: string): ItemEntry {
    let entry = this.data.scopes[scope];
    if (!entry) {
      entry = { status: "needs-review", seen: 0, firstSeen: nowIso(), lastSeen: nowIso() };
      this.data.scopes[scope] = entry;
    }
    entry.seen += 1;
    entry.lastSeen = nowIso();
    return entry;
  }

  private ensureMessageKey(key: string, sample?: string): ItemEntry {
    let entry = this.data.messageKeys[key];
    if (!entry) {
      entry = { status: "needs-review", seen: 0, firstSeen: nowIso(), lastSeen: nowIso(), sample };
      this.data.messageKeys[key] = entry;
    }
    entry.seen += 1;
    entry.lastSeen = nowIso();
    if (sample && key && (key === "text" || key === "caption" || key === "photo" || key === "sticker" || key === "contact" || key === "poll")) {
      entry.sample = sample;
    }
    return entry;
  }

  private ensureEntityType(type: string): ItemEntry {
    let entry = this.data.entityTypes[type];
    if (!entry) {
      entry = { status: "needs-review", seen: 0, firstSeen: nowIso(), lastSeen: nowIso() };
      this.data.entityTypes[type] = entry;
    }
    entry.seen += 1;
    entry.lastSeen = nowIso();
    return entry;
  }

  public observeScopes(scopes: string[]): ScopeDiffItem[] {
    const added: ScopeDiffItem[] = [];
    for (const scope of scopes) {
      const existed = !!this.data.scopes[scope];
      const entry = this.ensureScope(scope);
      if (!existed) {
        added.push({ scope, status: entry.status });
      }
    }
    if (added.length) this.scheduleSave();
    return added;
  }

  public observeMessageKeys(keys: string[], samples?: Record<string, string>): KeyDiffItem[] {
    const added: KeyDiffItem[] = [];
    for (const key of keys) {
      const existed = !!this.data.messageKeys[key];
      const entry = this.ensureMessageKey(key, samples?.[key]);
      if (!existed) {
        added.push({ key, status: entry.status, sample: entry.sample });
      }
    }
    if (added.length) this.scheduleSave();
    return added;
  }

  public observeEntityTypes(types: string[]): EntityTypeDiffItem[] {
    const added: EntityTypeDiffItem[] = [];
    for (const type of types) {
      const existed = !!this.data.entityTypes[type];
      const entry = this.ensureEntityType(type);
      if (!existed) {
        added.push({ type, status: entry.status });
      }
    }
    if (added.length) this.scheduleSave();
    return added;
  }

  public setMessageKeyStatus(key: string, status: Status) {
    const entry = this.ensureMessageKey(key);
    entry.status = status;
    this.scheduleSave();
  }

  public setEntityTypeStatus(type: string, status: Status) {
    const entry = this.ensureEntityType(type);
    entry.status = status;
    this.scheduleSave();
  }

  public setScopeStatus(scope: string, status: Status) {
    const entry = this.ensureScope(scope);
    entry.status = status;
    this.scheduleSave();
  }
}
