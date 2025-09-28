import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Status = "process" | "ignore" | "needs-review";

export interface ItemEntry {
  status: Status;
  seen: number;
  firstSeen: string;
  lastSeen: string;
  sample?: string;
  note?: string;
}

export interface StatusRegistryFile {
  version: 1;
  updatedAt: string;
  scopes: Record<string, ItemEntry>;
  keysByScope: Record<string, Record<string, ItemEntry>>;
  entityTypesByScope: Record<string, Record<string, ItemEntry>>;
}

export interface ScopeDiffItem { scope: string; status: Status }
export interface KeyDiffItem { key: string; status: Status; sample?: string }
export interface EntityTypeDiffItem { type: string; status: Status }

const STATUS_PATH = resolve(process.cwd(), "data", "registry-status.json");
const HANDLED_SNAPSHOT_JSON = resolve(process.cwd(), "data", "handled", "registry.json");
const CONFIG_PATH = resolve(process.cwd(), "data", "registry-config.json");

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
    keysByScope: {},
    entityTypesByScope: {},
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
  private cfgMtime = 0;
  private cfg?: RegistryConfig;

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
        const parsed = JSON.parse(raw) as Partial<StatusRegistryFile & {
          messageKeys?: Record<string, ItemEntry>;
          entityTypes?: Record<string, ItemEntry>;
        }>;
        if (parsed && parsed.scopes) {
          // migrate old shape if necessary
          const migrated: StatusRegistryFile = {
            version: 1,
            updatedAt: parsed.updatedAt ?? nowIso(),
            scopes: parsed.scopes,
            keysByScope: parsed.keysByScope ?? (parsed.messageKeys ? { message: parsed.messageKeys } : {}),
            entityTypesByScope: parsed.entityTypesByScope ?? (parsed.entityTypes ? { message: parsed.entityTypes } : {}),
          } as StatusRegistryFile;
          return migrated;
        }
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
        if (snapshot.messageKeys?.length) seeded.keysByScope["message"] = {};
        for (const key of snapshot.messageKeys ?? []) {
          seeded.keysByScope["message"][key] = { status: "process", seen: 0, firstSeen: ts, lastSeen: ts };
        }
        if (snapshot.textEntityTypes?.length) seeded.entityTypesByScope["message"] = {};
        for (const type of snapshot.textEntityTypes ?? []) {
          seeded.entityTypesByScope["message"][type] = { status: "process", seen: 0, firstSeen: ts, lastSeen: ts };
        }
      }
    } catch {
      // ignore
    }

    // Default: ignore edited_message until explicitly enabled in DB
    if (!seeded.scopes["edited_message"]) {
      const ts = nowIso();
      seeded.scopes["edited_message"] = { status: "ignore", seen: 0, firstSeen: ts, lastSeen: ts };
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

  private maybeReloadConfig(): void {
    try {
      if (!existsSync(CONFIG_PATH)) { this.cfg = undefined; this.cfgMtime = 0; return; }
      const stat = statSync(CONFIG_PATH);
      const m = stat.mtimeMs;
      if (m !== this.cfgMtime) {
        const raw = readFileSync(CONFIG_PATH, "utf8");
        this.cfg = JSON.parse(raw) as RegistryConfig;
        this.cfgMtime = m;
      }
    } catch {
      // ignore malformed config
    }
  }

  private scopeOverride(scope: string): ConfigEntry | undefined {
    this.maybeReloadConfig();
    return this.cfg?.scopes?.[scope];
  }

  private keyOverride(scope: string, key: string): ConfigEntry | undefined {
    this.maybeReloadConfig();
    return this.cfg?.keys?.[scope]?.[key];
  }

  private typeOverride(scope: string, type: string): ConfigEntry | undefined {
    this.maybeReloadConfig();
    return this.cfg?.entityTypes?.[scope]?.[type];
  }

  private ensureScope(scope: string): ItemEntry {
    let entry = this.data.scopes[scope];
    if (!entry) {
      const ovr = this.scopeOverride(scope);
      entry = { status: ovr?.status ?? "needs-review", seen: 0, firstSeen: nowIso(), lastSeen: nowIso(), note: ovr?.note };
      this.data.scopes[scope] = entry;
    }
    entry.seen += 1;
    entry.lastSeen = nowIso();
    const ovr = this.scopeOverride(scope);
    if (ovr?.status && entry.status !== ovr.status) entry.status = ovr.status;
    if (ovr?.note) entry.note = ovr.note;
    return entry;
  }

  private ensureMessageKey(scope: string, key: string, sample?: string): ItemEntry {
    if (!this.data.keysByScope[scope]) this.data.keysByScope[scope] = {};
    let entry = this.data.keysByScope[scope][key];
    if (!entry) {
      const ovr = this.keyOverride(scope, key);
      entry = { status: ovr?.status ?? "needs-review", seen: 0, firstSeen: nowIso(), lastSeen: nowIso(), sample, note: ovr?.note };
      this.data.keysByScope[scope][key] = entry;
    }
    entry.seen += 1;
    entry.lastSeen = nowIso();
    if (sample) entry.sample = sample;
    const ovr = this.keyOverride(scope, key);
    if (ovr?.status && entry.status !== ovr.status) entry.status = ovr.status;
    if (ovr?.note) entry.note = ovr.note;
    return entry;
  }

  private ensureEntityType(scope: string, type: string): ItemEntry {
    if (!this.data.entityTypesByScope[scope]) this.data.entityTypesByScope[scope] = {};
    let entry = this.data.entityTypesByScope[scope][type];
    if (!entry) {
      const ovr = this.typeOverride(scope, type);
      entry = { status: ovr?.status ?? "needs-review", seen: 0, firstSeen: nowIso(), lastSeen: nowIso(), note: ovr?.note };
      this.data.entityTypesByScope[scope][type] = entry;
    }
    entry.seen += 1;
    entry.lastSeen = nowIso();
    const ovr = this.typeOverride(scope, type);
    if (ovr?.status && entry.status !== ovr.status) entry.status = ovr.status;
    if (ovr?.note) entry.note = ovr.note;
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

  public observeMessageKeys(scope: string, keys: string[], samples?: Record<string, string>): Array<KeyDiffItem & { scope: string }> {
    const added: KeyDiffItem[] = [];
    for (const key of keys) {
      const existed = !!this.data.keysByScope[scope]?.[key];
      const entry = this.ensureMessageKey(scope, key, samples?.[key]);
      if (!existed) {
        added.push({ key, status: entry.status, sample: entry.sample });
      }
      // update cross-scope note: where this key appears
      const scopes: string[] = [];
      for (const s of Object.keys(this.data.keysByScope)) {
        if (this.data.keysByScope[s] && this.data.keysByScope[s][key]) scopes.push(s);
      }
      const note = scopes.length === 1 ? `лише у: ${scopes[0]}` : `скоупи: ${scopes.sort().join(", ")}`;
      for (const s of scopes) {
        const e = this.data.keysByScope[s][key];
        if (e) e.note = note;
      }
    }
    if (added.length) this.scheduleSave();
    return added.map((k) => ({ ...k, scope }));
  }

  public observeEntityTypes(scope: string, types: string[]): Array<EntityTypeDiffItem & { scope: string }> {
    const added: EntityTypeDiffItem[] = [];
    for (const type of types) {
      const existed = !!this.data.entityTypesByScope[scope]?.[type];
      const entry = this.ensureEntityType(scope, type);
      if (!existed) {
        added.push({ type, status: entry.status });
      }
      // update cross-scope note for entity type
      const scopes: string[] = [];
      for (const s of Object.keys(this.data.entityTypesByScope)) {
        if (this.data.entityTypesByScope[s] && this.data.entityTypesByScope[s][type]) scopes.push(s);
      }
      const note = scopes.length === 1 ? `лише у: ${scopes[0]}` : `скоупи: ${scopes.sort().join(", ")}`;
      for (const s of scopes) {
        const e = this.data.entityTypesByScope[s][type];
        if (e) e.note = note;
      }
    }
    if (added.length) this.scheduleSave();
    return added.map((t) => ({ ...t, scope }));
  }

  public setMessageKeyStatus(scope: string, key: string, status: Status) {
    const entry = this.ensureMessageKey(scope, key);
    entry.status = status;
    this.scheduleSave();
  }

  public setEntityTypeStatus(scope: string, type: string, status: Status) {
    const entry = this.ensureEntityType(scope, type);
    entry.status = status;
    this.scheduleSave();
  }

  public setScopeStatus(scope: string, status: Status) {
    const entry = this.ensureScope(scope);
    entry.status = status;
    this.scheduleSave();
  }

  public getScopeStatus(scope: string): Status | undefined {
    return this.data.scopes[scope]?.status;
  }

  public isScopeIgnored(scope: string): boolean {
    return this.getScopeStatus(scope) === "ignore";
  }

  public getMode(): RegistryMode {
    this.maybeReloadConfig();
    const m = (this.cfg?.mode as RegistryMode | undefined) ?? "dev";
    return m === "debug" || m === "prod" ? m : "dev";
  }
}

// Editable config overlay, hot-reloaded on change
interface ConfigEntry { status?: Status; note?: string }
interface RegistryConfig {
  mode?: "debug" | "dev" | "prod";
  scopes?: Record<string, ConfigEntry>;
  keys?: Record<string, Record<string, ConfigEntry>>;
  entityTypes?: Record<string, Record<string, ConfigEntry>>;
}

export type RegistryMode = "debug" | "dev" | "prod";
