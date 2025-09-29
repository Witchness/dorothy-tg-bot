import { snapshotSets } from "../entity_registry.js";
import { mergeArrayObjectSamples } from "../payload_merge.js";

const payloadKeyRe = /^New payload keys for\s+([^:]+):\s+(.+)$/i;
const payloadShapeRe = /^New payload shape detected for\s+([^\s]+)\s*\(([^)]+)\)$/i;
const msgKeysRe = /^New message keys observed(?::| \(album\):)\s+(.+)$/i;
const msgShapeRe = /^New message shape detected(?: \(album\))?\s*\(([^)]+)\)$/i;

function getByPath(root: any, label: string): any {
  // label like "message.photo" or "message.reply_to_message"
  let parts = label.split(".");
  // Root object is already the message; drop the leading scope token if present
  if (parts.length && (parts[0] === "message" || parts[0] === "edited_message" || parts[0] === "channel_post" || parts[0] === "edited_channel_post" || parts[0] === "business_message" || parts[0] === "edited_business_message")) {
    parts = parts.slice(1);
  }
  let cur: any = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function observedKeysFor(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    const { keys } = mergeArrayObjectSamples(value);
    return keys;
  }
  if (typeof value === "object") {
    return Object.keys(value);
  }
  return [];
}

function expectedKeysForLabel(label: string): string[] {
  const sets = snapshotSets();
  const payloadLabel = label.startsWith("payload:") ? label : `payload:${label}`;
  const set = sets.payloadKeySets.get(payloadLabel);
  return set ? Array.from(set).sort() : [];
}

export interface AlertDetail {
  header: string; // original summary line
  lines: string[]; // extra lines
}

export function buildAlertDetail(alert: string, message: any): AlertDetail | null {
  // payload keys added
  let m = alert.match(payloadKeyRe);
  if (m) {
    const label = m[1];
    const gotKeys = m[2].split(",").map((s) => s.trim()).filter(Boolean);
    const expected = expectedKeysForLabel(label);
    const value = getByPath(message, label);
    const observed = observedKeysFor(value);
    const added = gotKeys;
    const missing = expected.filter((k) => !observed.includes(k));
    const lines: string[] = [];
    lines.push(`Очікувалось (реєстр): ${expected.length ? expected.join(", ") : "(не відомо)"}`);
    lines.push(`Отримано (поточні ключі): ${observed.length ? observed.join(", ") : "(порожньо)"}`);
    if (added.length || missing.length) {
      const diffs: string[] = [];
      if (added.length) diffs.push(`+ ${added.join(", ")}`);
      if (missing.length) diffs.push(`- ${missing.join(", ")}`);
      lines.push(`Зміни: ${diffs.join("; ")}`);
    }
    lines.push(`Причина: keys_added`);
    return { header: alert, lines };
  }
  // payload shape change
  m = alert.match(payloadShapeRe);
  if (m) {
    const label = m[1];
    const signature = m[2];
    const expected = expectedKeysForLabel(label);
    const value = getByPath(message, label);
    const observed = observedKeysFor(value);
    const lines: string[] = [];
    lines.push(`Очікувалось (реєстр): ${expected.length ? expected.join(", ") : "(не відомо)"}`);
    lines.push(`Отримано (поточні ключі): ${observed.length ? observed.join(", ") : "(порожньо)"}`);
    lines.push(`Зміни ключів: ${observed.filter(k => !expected.includes(k)).length || expected.filter(k => !observed.includes(k)).length ? "є" : "нема"}`);
    lines.push(`Причина: shape_changed; сигнатура: ${signature}`);
    return { header: alert, lines };
  }
  // message keys / shape (top-level message)
  m = alert.match(msgKeysRe);
  if (m) {
    const got = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const sets = snapshotSets();
    const expected = Array.from(sets.messageKeySet).sort();
    const observed = Object.keys(message ?? {}).filter((k) => {
      const v = message?.[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const added = got;
    const missing = expected.filter((k) => !observed.includes(k));
    const lines: string[] = [];
    lines.push(`Очікувалось (реєстр): ${expected.length ? expected.join(", ") : "(не відомо)"}`);
    lines.push(`Отримано (поточні ключі): ${observed.length ? observed.join(", ") : "(порожньо)"}`);
    if (added.length || missing.length) {
      const diffs: string[] = [];
      if (added.length) diffs.push(`+ ${added.join(", ")}`);
      if (missing.length) diffs.push(`- ${missing.join(", ")}`);
      lines.push(`Зміни: ${diffs.join("; ")}`);
    }
    lines.push(`Причина: keys_added`);
    return { header: alert, lines };
  }
  m = alert.match(msgShapeRe);
  if (m) {
    const signature = m[1];
    const sets = snapshotSets();
    const expected = Array.from(sets.messageKeySet).sort();
    const observed = Object.keys(message ?? {}).filter((k) => {
      const v = message?.[k];
      return v !== undefined && v !== null && typeof v !== "function";
    });
    const lines: string[] = [];
    lines.push(`Очікувалось (реєстр): ${expected.length ? expected.join(", ") : "(не відомо)"}`);
    lines.push(`Отримано (поточні ключі): ${observed.length ? observed.join(", ") : "(порожньо)"}`);
    lines.push(`Зміни ключів: ${observed.filter(k => !expected.includes(k)).length || expected.filter(k => !observed.includes(k)).length ? "є" : "нема"}`);
    lines.push(`Причина: shape_changed; сигнатура: ${signature}`);
    return { header: alert, lines };
  }
  return null;
}