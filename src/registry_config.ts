import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Status = "process" | "ignore" | "needs-review";
export type Kind = "scope" | "key" | "type";

export interface ConfigEntry { status?: Status; note?: string }
export interface RegistryConfig {
  scopes?: Record<string, ConfigEntry>;
  keys?: Record<string, Record<string, ConfigEntry>>;
  entityTypes?: Record<string, Record<string, ConfigEntry>>;
}

const CONFIG_PATH = resolve(process.cwd(), "data", "registry-config.json");

function ensureDirFor(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadConfig(): RegistryConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      const cfg = JSON.parse(raw) as RegistryConfig;
      return cfg ?? {};
    }
  } catch {
    // ignore
  }
  return {};
}

function saveConfig(cfg: RegistryConfig): void {
  ensureDirFor(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

export function setStatus(kind: Kind, scope: string, name: string | undefined, status: Status): void {
  const cfg = loadConfig();
  if (kind === "scope") {
    cfg.scopes = cfg.scopes ?? {};
    cfg.scopes[scope] = { ...(cfg.scopes[scope] ?? {}), status };
  } else if (kind === "key") {
    cfg.keys = cfg.keys ?? {};
    cfg.keys[scope] = cfg.keys[scope] ?? {};
    if (!name) throw new Error("Key name missing");
    cfg.keys[scope][name] = { ...(cfg.keys[scope][name] ?? {}), status };
  } else if (kind === "type") {
    cfg.entityTypes = cfg.entityTypes ?? {};
    cfg.entityTypes[scope] = cfg.entityTypes[scope] ?? {};
    if (!name) throw new Error("Type name missing");
    cfg.entityTypes[scope][name] = { ...(cfg.entityTypes[scope][name] ?? {}), status };
  }
  saveConfig(cfg);
}

export function setNote(kind: Kind, scope: string, name: string | undefined, note: string): void {
  const cfg = loadConfig();
  if (kind === "scope") {
    cfg.scopes = cfg.scopes ?? {};
    cfg.scopes[scope] = { ...(cfg.scopes[scope] ?? {}), note };
  } else if (kind === "key") {
    cfg.keys = cfg.keys ?? {};
    cfg.keys[scope] = cfg.keys[scope] ?? {};
    if (!name) throw new Error("Key name missing");
    cfg.keys[scope][name] = { ...(cfg.keys[scope][name] ?? {}), note };
  } else if (kind === "type") {
    cfg.entityTypes = cfg.entityTypes ?? {};
    cfg.entityTypes[scope] = cfg.entityTypes[scope] ?? {};
    if (!name) throw new Error("Type name missing");
    cfg.entityTypes[scope][name] = { ...(cfg.entityTypes[scope][name] ?? {}), note };
  }
  saveConfig(cfg);
}

export { CONFIG_PATH };

