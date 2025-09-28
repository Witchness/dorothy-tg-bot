import type { Status } from "./registry_status.js";

export interface DiffReportScopes { scope: string; status: Status }
export interface DiffReportKeys { scope: string; key: string; status: Status; sample?: string }
export interface DiffReportEntityTypes { scope: string; type: string; status: Status }

export interface DiffReport {
  newScopes?: DiffReportScopes[];
  newMessageKeys?: DiffReportKeys[];
  newEntityTypes?: DiffReportEntityTypes[];
}

function badge(status: Status): string {
  if (status === "process") return "✅ process";
  if (status === "ignore") return "🚫 ignore";
  return "🟨 needs-review";
}

export function formatDiffReport(diff: DiffReport): string | null {
  const lines: string[] = [];

  if (diff.newScopes && diff.newScopes.length) {
    lines.push("Нові типи апдейтів:");
    for (const s of diff.newScopes) lines.push(`- ${s.scope}: ${badge(s.status)}`);
  }

  if (diff.newMessageKeys && diff.newMessageKeys.length) {
    const byScope = new Map<string, DiffReportKeys[]>();
    for (const k of diff.newMessageKeys) {
      const arr = byScope.get(k.scope) ?? [];
      arr.push(k);
      byScope.set(k.scope, arr);
    }
    for (const scope of Array.from(byScope.keys()).sort()) {
      if (lines.length) lines.push("");
      lines.push(`Нові ключі у ${scope}:`);
      const arr = byScope.get(scope)!;
      for (const k of arr) {
        const sample = k.sample ? `; приклад: ${k.sample}` : "";
        lines.push(`- ${k.key}: ${badge(k.status)}${sample}`);
      }
    }
  }

  if (diff.newEntityTypes && diff.newEntityTypes.length) {
    const byScope = new Map<string, DiffReportEntityTypes[]>();
    for (const e of diff.newEntityTypes) {
      const arr = byScope.get(e.scope) ?? [];
      arr.push(e);
      byScope.set(e.scope, arr);
    }
    for (const scope of Array.from(byScope.keys()).sort()) {
      if (lines.length) lines.push("");
      lines.push(`Нові типи ентіті у ${scope}:`);
      const arr = byScope.get(scope)!;
      for (const e of arr) lines.push(`- ${e.type}: ${badge(e.status)}`);
    }
  }

  if (!lines.length) return null;
  return lines.join("\n");
}
