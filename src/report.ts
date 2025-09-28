import type { StatusRegistryFile } from "./registry_status.js";

type Bucket = "process" | "ignore" | "needs-review";

function sortKeys<T extends string>(arr: T[]): T[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}

export function buildRegistryMarkdown(reg: StatusRegistryFile): string {
  const lines: string[] = [];
  lines.push("# Entity Registry");
  lines.push("");
  lines.push(`Оновлено: ${reg.updatedAt}`);
  lines.push("");

  const scopesBy: Record<Bucket, string[]> = { "process": [], "ignore": [], "needs-review": [] };
  for (const [name, entry] of Object.entries(reg.scopes)) scopesBy[entry.status].push(name);

  const allKeys: string[] = [];
  for (const [scope, keys] of Object.entries(reg.keysByScope ?? {})) {
    for (const k of Object.keys(keys)) allKeys.push(`${scope}.${k}`);
  }
  const allTypes: string[] = [];
  for (const [scope, types] of Object.entries(reg.entityTypesByScope ?? {})) {
    for (const t of Object.keys(types)) allTypes.push(`${scope}.${t}`);
  }
  const totalKeys = allKeys.length;
  const totalTypes = allTypes.length;
  lines.push(`Всього: ${plural(totalKeys, "key", "keys")}, ${plural(totalTypes, "entity type", "entity types")}`);
  lines.push("");

  const section = (title: string, obj: Record<Bucket, string[]>) => {
    const blocks: string[] = [];
    const processed = sortKeys(obj["process"]);
    const ignored = sortKeys(obj["ignore"]);
    const needs = sortKeys(obj["needs-review"]);
    blocks.push(`## ${title}`);
    if (processed.length) blocks.push(`- Обробляємо: ${processed.map((k) => `\`${k}\``).join(", ")}`);
    if (ignored.length) blocks.push(`- Не обробляємо: ${ignored.map((k) => `\`${k}\``).join(", ")}`);
    if (needs.length) blocks.push(`- Потребує огляду: ${needs.map((k) => `\`${k}\``).join(", ")}`);
    if (!processed.length && !ignored.length && !needs.length) blocks.push("- (порожньо)");
    blocks.push("");
    return blocks.join("\n");
  };

  lines.push(section("Scopes (update.*)", scopesBy));
  // Scope notes
  const scopeNotes = Object.entries(reg.scopes).filter(([, e]) => !!e.note);
  if (scopeNotes.length) {
    lines.push("### Примітки до scopes");
    for (const [name, e] of scopeNotes) {
      lines.push(`- ${name}: ${e.note}`);
    }
    lines.push("");
  }

  // Keys by scope
  const scopeNames = Object.keys(reg.keysByScope ?? {}).sort();
  lines.push("## Message keys (by scope)");
  if (!scopeNames.length) {
    lines.push("- (порожньо)");
  } else {
    for (const scope of scopeNames) {
      const by: Record<Bucket, string[]> = { "process": [], "ignore": [], "needs-review": [] };
      for (const [k, e] of Object.entries(reg.keysByScope[scope])) by[e.status].push(k);
      const processed = sortKeys(by["process"]);
      const ignored = sortKeys(by["ignore"]);
      const needs = sortKeys(by["needs-review"]);
      lines.push(`### ${scope}`);
      if (processed.length) lines.push(`- Обробляємо: ${processed.map((k) => `\`${k}\``).join(", ")}`);
      if (ignored.length) lines.push(`- Не обробляємо: ${ignored.map((k) => `\`${k}\``).join(", ")}`);
      if (needs.length) lines.push(`- Потребує огляду: ${needs.map((k) => `\`${k}\``).join(", ")}`);
      if (!processed.length && !ignored.length && !needs.length) lines.push("- (порожньо)");
      // notes for keys
      const notePairs = Object.entries(reg.keysByScope[scope]).filter(([, e]) => !!e.note);
      if (notePairs.length) {
        lines.push("- Примітки:");
        for (const [k, e] of notePairs) {
          lines.push(`  - ${k}: ${e.note}`);
        }
      }
    }
  }

  // Entity types by scope
  const typeScopeNames = Object.keys(reg.entityTypesByScope ?? {}).sort();
  lines.push("");
  lines.push("## Entity types (by scope)");
  if (!typeScopeNames.length) {
    lines.push("- (порожньо)");
  } else {
    for (const scope of typeScopeNames) {
      const by: Record<Bucket, string[]> = { "process": [], "ignore": [], "needs-review": [] };
      for (const [t, e] of Object.entries(reg.entityTypesByScope[scope])) by[e.status].push(t);
      const processed = sortKeys(by["process"]);
      const ignored = sortKeys(by["ignore"]);
      const needs = sortKeys(by["needs-review"]);
      lines.push(`### ${scope}`);
      if (processed.length) lines.push(`- Обробляємо: ${processed.map((k) => `\`${k}\``).join(", ")}`);
      if (ignored.length) lines.push(`- Не обробляємо: ${ignored.map((k) => `\`${k}\``).join(", ")}`);
      if (needs.length) lines.push(`- Потребує огляду: ${needs.map((k) => `\`${k}\``).join(", ")}`);
      if (!processed.length && !ignored.length && !needs.length) lines.push("- (порожньо)");
      // notes for types
      const notePairs = Object.entries(reg.entityTypesByScope[scope]).filter(([, e]) => !!e.note);
      if (notePairs.length) {
        lines.push("- Примітки:");
        for (const [k, e] of notePairs) {
          lines.push(`  - ${k}: ${e.note}`);
        }
      }
    }
  }
  lines.push("> Підказка: /registry відправить цей звіт у чат.");
  lines.push("");

  return lines.join("\n");
}
