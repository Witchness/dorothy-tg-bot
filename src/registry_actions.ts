import { InlineKeyboard } from "grammy";
import type { DiffReport } from "./notifier.js";
import type { Status, StatusRegistryFile } from "./registry_status.js";
import { describeMessageKey } from "./humanize.js";

type Kind = "s" | "k" | "t"; // scope, key, type

export function buildInlineKeyboardForDiff(diff: DiffReport): InlineKeyboard | null {
  const kb = new InlineKeyboard();
  let rows = 0;

  const addRow = (label: string, dataPrefix: string, current?: Status) => {
    const suffix = current ? ` [${current}]` : "";
    kb.text(label + suffix, `noop`).row();
    kb.text(`✅ process`, `reg|${dataPrefix}|process`)
      .text(`🚫 ignore`, `reg|${dataPrefix}|ignore`)
      .text(`🟨 review`, `reg|${dataPrefix}|needs-review`)
      .text(`✏️ note`, `reg|${dataPrefix}|note`)
      .row();
    rows += 2;
  };

  const maxRows = 12; // safety cap
  const trim = (s: string, n = 28) => {
    if (!s) return "";
    // drop leading/trailing quotes from JSON.stringify-ed text samples
    const t = s.replace(/^\"|\"$/g, "");
    return t.length > n ? t.slice(0, n) + "…" : t;
  };

  if (diff.newScopes && diff.newScopes.length) {
    for (const s of diff.newScopes) {
      if (rows >= maxRows) break;
      addRow(`scope: ${s.scope}`, `s|${s.scope}`, s.status);
    }
  }

  if (diff.newMessageKeys && diff.newMessageKeys.length) {
    for (const k of diff.newMessageKeys) {
      if (rows >= maxRows) break;
      const sample = k.sample ? ` (${trim(k.sample)})` : "";
      addRow(`key: ${k.scope}.${k.key}${sample}`, `k|${k.scope}|${k.key}`, k.status);
    }
  }

  if (diff.newEntityTypes && diff.newEntityTypes.length) {
    for (const t of diff.newEntityTypes) {
      if (rows >= maxRows) break;
      addRow(`type: ${t.scope}.${t.type}`, `t|${t.scope}|${t.type}`, t.status);
    }
  }

  return rows ? kb : null;
}

export function parseRegCallback(data: string): { kind: Kind; scope: string; name?: string; status: Status } | null {
  // format: reg|<kind>|<scope>[|<name>]|<status|note>
  if (!data || !data.startsWith("reg|")) return null;
  const parts = data.split("|");
  if (parts.length < 4) return null;
  const kind = parts[1] as Kind;
  const scope = parts[2];
  let name: string | undefined;
  let actionOrStatus: string;
  if (kind === "s") {
    actionOrStatus = parts[3];
  } else {
    if (parts.length < 5) return null;
    name = parts[3];
    actionOrStatus = parts[4];
  }
  if (actionOrStatus === "note") {
    // @ts-ignore expose via type cast to status union placeholder; caller will handle special case
    return { kind, scope, name, status: "note" as any };
  }
  const status = actionOrStatus as Status;
  if (status !== "process" && status !== "ignore" && status !== "needs-review") return null;
  return { kind, scope, name, status };
}

export function buildInlineKeyboardForScope(scope: string, reg: StatusRegistryFile): InlineKeyboard | null {
  const kb = new InlineKeyboard();
  let rows = 0;
  const maxRows = 24;

  const addStatusRow = (label: string, dataPrefix: string, current?: Status) => {
    const suffix = current ? ` [${current}]` : "";
    kb.text(label + suffix, `noop`).row();
    kb.text(`✅ process`, `reg|${dataPrefix}|process`)
      .text(`🚫 ignore`, `reg|${dataPrefix}|ignore`)
      .text(`🟨 review`, `reg|${dataPrefix}|needs-review`)
      .text(`✏️ note`, `reg|${dataPrefix}|note`).row();
    rows += 2;
  };

  const scopeStatus = reg.scopes[scope]?.status;
  addStatusRow(`scope: ${scope}`, `s|${scope}`, scopeStatus);

  const keys = Object.entries(reg.keysByScope[scope] ?? {});
  for (const [key, entry] of keys) {
    if (rows >= maxRows) break;
    addStatusRow(`key: ${scope}.${key}`, `k|${scope}|${key}`, entry.status);
  }

  const types = Object.entries(reg.entityTypesByScope[scope] ?? {});
  for (const [type, entry] of types) {
    if (rows >= maxRows) break;
    addStatusRow(`type: ${scope}.${type}`, `t|${scope}|${type}`, entry.status);
  }

  return rows ? kb : null;
}

export function buildInlineKeyboardForNestedPayload(label: string, keys: string[], reg: StatusRegistryFile): InlineKeyboard | null {
  // label examples: "message.reply_to_message", "message.forward_origin", "edited_message.reply_to_message"
  let scope: string | null = null;
  let base: string | null = null;
  if (label.startsWith("message.")) {
    scope = "message";
    base = label.slice("message.".length).split(".")[0] || null;
  } else if (label.startsWith("edited_message.")) {
    scope = "edited_message";
    base = label.slice("edited_message.".length).split(".")[0] || null;
  }
  if (!scope || !base) return null;

  const kb = new InlineKeyboard();
  let rows = 0;
  const addRow = (label: string, dataPrefix: string, current?: Status) => {
    const suffix = current ? ` [${current}]` : "";
    kb.text(label + suffix, `noop`).row();
    kb.text(`✅ process`, `reg|${dataPrefix}|process`)
      .text(`🚫 ignore`, `reg|${dataPrefix}|ignore`)
      .text(`🟨 review`, `reg|${dataPrefix}|needs-review`)
      .text(`✏️ note`, `reg|${dataPrefix}|note`).row();
    rows += 2;
  };

  // Base key under the scope
  const baseStatus = reg.keysByScope[scope]?.[base]?.status;
  addRow(`key: ${scope}.${base}`, `k|${scope}|${base}`, baseStatus);

  // For reply_to_message / quoted_message treat nested keys as message keys
  if (base === "reply_to_message" || base === "quoted_message") {
    const seen = new Set<string>();
    for (const k of keys) {
      const name = k.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const st = reg.keysByScope[scope]?.[name]?.status;
      addRow(`key: ${scope}.${name}`, `k|${scope}|${name}`, st);
      if (rows >= 20) break;
    }
  }

  return rows ? kb : null;
}

export function buildInlineKeyboardForMessage(scope: string, presentKeys: string[], presentTypes: string[], reg: StatusRegistryFile, mode: "debug" | "dev", samples?: Record<string, string>): InlineKeyboard | null {
  const kb = new InlineKeyboard();
  let rows = 0;
  const addRow = (label: string, dataPrefix: string, current?: Status) => {
    const suffix = current ? ` [${current}]` : "";
    kb.text(label + suffix, `noop`).row();
    kb.text(`✅ process`, `reg|${dataPrefix}|process`)
      .text(`🚫 ignore`, `reg|${dataPrefix}|ignore`)
      .text(`🟨 review`, `reg|${dataPrefix}|needs-review`)
      .text(`✏️ note`, `reg|${dataPrefix}|note`).row();
    rows += 2;
  };

  const scopeStatus = reg.scopes[scope]?.status;
  addRow(`scope: ${scope}`, `s|${scope}`, scopeStatus);

  const includeKey = (k: string) => {
    const st = reg.keysByScope[scope]?.[k]?.status;
    if (mode === "dev" && st === "process") return false; // hide processed in dev
    return true;
  };
  const includeType = (t: string) => {
    const st = reg.entityTypesByScope[scope]?.[t]?.status;
    if (mode === "dev" && st === "process") return false;
    return true;
  };

  const trim = (s: string, n = 28) => {
    if (!s) return "";
    const t = s.replace(/^\"|\"$/g, "");
    return t.length > n ? t.slice(0, n) + "…" : t;
  };

  for (const key of presentKeys) {
    if (!includeKey(key)) continue;
    const st = reg.keysByScope[scope]?.[key]?.status;
    const sample = samples?.[key] ? ` (${trim(samples[key])})` : "";
    addRow(`key: ${scope}.${key}${sample}`, `k|${scope}|${key}`, st);
    if (rows >= 24) break;
  }

  for (const type of presentTypes) {
    if (!includeType(type)) continue;
    const st = reg.entityTypesByScope[scope]?.[type]?.status;
    addRow(`type: ${scope}.${type}`, `t|${scope}|${type}`, st);
    if (rows >= 36) break;
  }

  return rows ? kb : null;
}
