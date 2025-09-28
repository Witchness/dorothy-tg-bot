import { InlineKeyboard } from "grammy";
import type { DiffReport } from "./notifier.js";
import type { Status } from "./registry_status.js";

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

  if (diff.newScopes && diff.newScopes.length) {
    for (const s of diff.newScopes) {
      if (rows >= maxRows) break;
      addRow(`scope: ${s.scope}`, `s|${s.scope}`, s.status);
    }
  }

  if (diff.newMessageKeys && diff.newMessageKeys.length) {
    for (const k of diff.newMessageKeys) {
      if (rows >= maxRows) break;
      addRow(`key: ${k.scope}.${k.key}`, `k|${k.scope}|${k.key}`, k.status);
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
