import type { Status } from "./registry_status.js";

export interface DiffReportScopes { scope: string; status: Status }
export interface DiffReportKeys { key: string; status: Status; sample?: string }
export interface DiffReportEntityTypes { type: string; status: Status }

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
    if (lines.length) lines.push("");
    lines.push("Нові ключі у message:");
    for (const k of diff.newMessageKeys) {
      const sample = k.sample ? `; приклад: ${k.sample}` : "";
      lines.push(`- ${k.key}: ${badge(k.status)}${sample}`);
    }
  }

  if (diff.newEntityTypes && diff.newEntityTypes.length) {
    if (lines.length) lines.push("");
    lines.push("Нові типи ентіті:");
    for (const e of diff.newEntityTypes) lines.push(`- ${e.type}: ${badge(e.status)}`);
  }

  if (!lines.length) return null;
  return lines.join("\n");
}

