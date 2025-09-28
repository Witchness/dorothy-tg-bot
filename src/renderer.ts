import type { Message, MessageEntity } from "grammy/types";

const escapeHtml = (s: string) => s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const wrap = (tag: string, content: string, attrs?: Record<string, string>) => {
  const attrStr = attrs ? " " + Object.entries(attrs).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(" ") : "";
  return `<${tag}${attrStr}>${content}</${tag}>`;
};

export type QuoteRenderMode = "prefix" | "html";

const entityToHtml = (text: string, entities: MessageEntity[] | undefined, quotes: QuoteRenderMode = "prefix"): string => {
  if (!entities?.length) return escapeHtml(text);
  const openMap = new Map<number, Array<{ tag: string; weight: number }>>();
  const closeMap = new Map<number, Array<{ start: number; tag: string; weight: number }>>();
  // Track quote ranges to render as '> ' prefixes per line (instead of <blockquote>)
  const quoteStart = new Map<number, number>();
  const quoteEnd = new Map<number, number>();

  const pushOpen = (pos: number, tag: string, weight: number) => {
    const arr = openMap.get(pos) ?? [];
    arr.push({ tag, weight });
    openMap.set(pos, arr);
  };
  const pushClose = (pos: number, start: number, tag: string, weight: number) => {
    const arr = closeMap.get(pos) ?? [];
    arr.push({ start, tag, weight });
    closeMap.set(pos, arr);
  };

  const weightFor = (type: string): number => {
    switch (type) {
      case "text_link":
      case "text_mention": return 100; // outermost
      case "blockquote":
      case "expandable_blockquote": return 110; // make quotes the outermost wrapper
      case "custom_emoji": return 95;
      case "pre": return 90;
      case "code": return 80;
      case "underline": return 70;
      case "italic": return 60;
      case "bold": return 50;
      case "strikethrough": return 40;
      case "spoiler": return 30;
      default: return 10;
    }
  };

  for (const e of entities) {
    const start = e.offset;
    const end = e.offset + e.length;
    let open = "";
    let close = "";
    const w = weightFor(e.type);
    switch (e.type) {
      case "bold": open = "<b>"; close = "</b>"; break;
      case "italic": open = "<i>"; close = "</i>"; break;
      case "underline": open = "<u>"; close = "</u>"; break;
      case "strikethrough": open = "<s>"; close = "</s>"; break;
      case "code": open = "<code>"; close = "</code>"; break;
      case "pre": open = "<pre>"; close = "</pre>"; break;
      case "spoiler": open = '<span class="tg-spoiler">'; close = "</span>"; break;
      case "text_link": {
        const url = (e as any).url as string | undefined;
        const safe = url ? escapeHtml(url) : "";
        open = `<a href="${safe}">`;
        close = "</a>";
        break;
      }
      case "text_mention": {
        const user = (e as any).user as { id?: number } | undefined;
        const href = user?.id ? `tg://user?id=${user.id}` : "";
        open = `<a href="${escapeHtml(href)}">`;
        close = "</a>";
        break;
      }
      case "custom_emoji": {
        const id = (e as any).custom_emoji_id as string | undefined;
        const eid = id ? escapeHtml(id) : "";
        open = `<tg-emoji emoji-id="${eid}">`;
        close = "</tg-emoji>";
        break;
      }
      case "blockquote": {
        if (quotes === "html") {
          open = `<blockquote>`; close = `</blockquote>`;
        } else {
          quoteStart.set(start, (quoteStart.get(start) ?? 0) + 1);
          quoteEnd.set(end, (quoteEnd.get(end) ?? 0) + 1);
        }
        break;
      }
      case "expandable_blockquote": {
        if (quotes === "html") {
          open = `<blockquote expandable="true">`; close = `</blockquote>`;
        } else {
          quoteStart.set(start, (quoteStart.get(start) ?? 0) + 1);
          quoteEnd.set(end, (quoteEnd.get(end) ?? 0) + 1);
        }
        break;
      }
      default: break;
    }
    if (open && close) {
      pushOpen(start, open, w);
      pushClose(end, start, close, w);
    }
  }

  let out = "";
  let quoteDepth = 0;
  let atLineStart = true;
  for (let i = 0; i < text.length; i++) {
    // Apply quote end at this position (range is [start, end)) — only for prefix mode
    if (quotes === "prefix") {
      const qEnd = quoteEnd.get(i);
      if (qEnd) quoteDepth = Math.max(0, quoteDepth - qEnd);
    }

    const closing = closeMap.get(i);
    if (closing && closing.length) {
      // Close inner first: larger start first, and for equal start, smaller weight first
      closing.sort((a, b) => (b.start - a.start) || (a.weight - b.weight));
      for (const c of closing) out += c.tag;
    }
    // Apply quote start and prefix if in prefix mode
    if (quotes === "prefix") {
      const qStart = quoteStart.get(i);
      if (qStart) quoteDepth += qStart;
      if (atLineStart && quoteDepth > 0) {
        out += "&gt; ";
      }
    }

    const opening = openMap.get(i);
    if (opening && opening.length) {
      // Open outer first: larger weight first
      opening.sort((a, b) => b.weight - a.weight);
      for (const o of opening) out += o.tag;
    }
    const ch = text[i];
    out += escapeHtml(ch);
    atLineStart = ch === "\n";
  }
  // Close tags that end exactly at text.length
  const tailClosing = closeMap.get(text.length);
  if (tailClosing && tailClosing.length) {
    tailClosing.sort((a, b) => (b.start - a.start) || (a.weight - b.weight));
    for (const c of tailClosing) out += c.tag;
  }
  return out;
};

const formatBytes = (size?: number | string) => {
  if (!size) return "";
  const value = typeof size === "string" ? Number(size) : size;
  if (!value || Number.isNaN(value)) return "";
  if (value < 1024) return `${value} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let current = value / 1024;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current.toFixed(1)} ${units[index]}`;
};

export function renderMessageHTML(msg: Message, quotes: QuoteRenderMode = "prefix"): { html: string; insights: string[] } {
  const lines: string[] = [];
  const text = msg.text ?? msg.caption ?? "";
  if (text) {
    const entities = msg.entities ?? msg.caption_entities;
    lines.push(entityToHtml(text, entities, quotes));
  }
  const insights: string[] = [];
  const urls: string[] = [];
  const hashtags: string[] = [];
  const mentions: string[] = [];
  for (const e of (msg.entities ?? msg.caption_entities ?? [])) {
    const segment = Array.from(text).slice(e.offset, e.offset + e.length).join("");
    switch (e.type) {
      case "url": urls.push(segment); break;
      case "text_link": if ((e as any).url) urls.push((e as any).url as string); break;
      case "hashtag": hashtags.push(segment); break;
      case "mention": mentions.push(segment); break;
    }
  }
  const attachments: string[] = [];
  if (msg.photo?.length) {
    const p = msg.photo.at(-1);
    if (p) attachments.push(`Фото ${p.width}×${p.height}${p.file_size ? ` (${formatBytes(p.file_size)})` : ""}`.trim());
  }
  if ((msg as any).video) {
    const v = (msg as any).video as any;
    attachments.push(`Відео ${v.width}×${v.height}${v.file_size ? ` (${formatBytes(v.file_size)})` : ""}`.trim());
  }
  if ((msg as any).document) {
    const d = (msg as any).document as any;
    attachments.push(`${d.file_name ?? "Документ"}${d.mime_type ? `, ${d.mime_type}` : ""}${d.file_size ? ` (${formatBytes(d.file_size)})` : ""}`.trim());
  }
  if ((msg as any).animation) {
    const a = (msg as any).animation as any;
    attachments.push(`GIF ${a.width}×${a.height}${a.file_size ? ` (${formatBytes(a.file_size)})` : ""}`.trim());
  }

  if (attachments.length) {
    lines.push("\n<b>📎 Вкладення</b>:");
    for (const a of attachments) lines.push(`• ${escapeHtml(a)}`);
  }
  if (urls.length || hashtags.length || mentions.length) {
    lines.push("\n<b>ℹ️ Інсайти</b>:");
    if (urls.length) lines.push(`• Посилання: ${urls.map(escapeHtml).join(", ")}`);
    if (hashtags.length) lines.push(`• Хештеги: ${hashtags.map(escapeHtml).join(", ")}`);
    if (mentions.length) lines.push(`• Згадки: ${mentions.map(escapeHtml).join(", ")}`);
  }

  const html = lines.join("\n");
  return { html, insights: [...urls, ...hashtags, ...mentions] };
}

export function renderMediaGroupHTML(items: Message[], quotes: QuoteRenderMode = "prefix"): { html: string } {
  const lines: string[] = [];
  const first = items[0];
  if (first?.caption) {
    lines.push(entityToHtml(first.caption, first.caption_entities, quotes));
  }
  const attachments: string[] = [];
  for (const m of items) {
    if (m.photo?.length) {
      const p = m.photo.at(-1);
      if (p) attachments.push(`Фото ${p.width}×${p.height}${p.file_size ? ` (${formatBytes(p.file_size)})` : ""}`.trim());
    } else if ((m as any).video) {
      const v = (m as any).video as any;
      attachments.push(`Відео ${v.width}×${v.height}${v.file_size ? ` (${formatBytes(v.file_size)})` : ""}`.trim());
    } else if ((m as any).document) {
      const d = (m as any).document as any;
      attachments.push(`${d.file_name ?? "Документ"}${d.mime_type ? `, ${d.mime_type}` : ""}${d.file_size ? ` (${formatBytes(d.file_size)})` : ""}`.trim());
    } else if ((m as any).animation) {
      const a = (m as any).animation as any;
      attachments.push(`GIF ${a.width}×${a.height}${a.file_size ? ` (${formatBytes(a.file_size)})` : ""}`.trim());
    }
  }
  if (attachments.length) {
    lines.push("\n<b>📎 Вкладення</b>:");
    for (const a of attachments) lines.push(`• ${escapeHtml(a)}`);
  }
  return { html: lines.join("\n") };
}
