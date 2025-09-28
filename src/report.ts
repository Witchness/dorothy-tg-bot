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
  const msgKeysBy: Record<Bucket, string[]> = { "process": [], "ignore": [], "needs-review": [] };
  for (const [name, entry] of Object.entries(reg.messageKeys)) msgKeysBy[entry.status].push(name);
  const typesBy: Record<Bucket, string[]> = { "process": [], "ignore": [], "needs-review": [] };
  for (const [name, entry] of Object.entries(reg.entityTypes)) typesBy[entry.status].push(name);

  const totalKeys = Object.keys(reg.messageKeys).length;
  const totalTypes = Object.keys(reg.entityTypes).length;
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
  lines.push(section("Message keys", msgKeysBy));
  lines.push(section("Entity types", typesBy));
  lines.push("> Підказка: /registry відправить цей звіт у чат.");
  lines.push("");

  return lines.join("\n");
}

