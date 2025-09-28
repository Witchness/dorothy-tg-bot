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

const entityToHtml = (text: string, entities: MessageEntity[] | undefined): string => {
  if (!entities?.length) return escapeHtml(text);
  const openMap = new Map<number, string[]>();
  const closeMap = new Map<number, Array<{ start: number; tag: string }>>();

  const pushOpen = (pos: number, tag: string) => {
    const arr = openMap.get(pos) ?? [];
    arr.push(tag);
    openMap.set(pos, arr);
  };
  const pushClose = (pos: number, start: number, tag: string) => {
    const arr = closeMap.get(pos) ?? [];
    arr.push({ start, tag });
    closeMap.set(pos, arr);
  };

  for (const e of entities) {
    const start = e.offset;
    const end = e.offset + e.length;
    let open = "";
    let close = "";
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
      case "blockquote": {
        open = "<blockquote>"; close = "</blockquote>"; break;
      }
      case "expandable_blockquote": {
        open = '<blockquote expandable="true">'; close = "</blockquote>"; break;
      }
      default: break;
    }
    if (open && close) {
      pushOpen(start, open);
      pushClose(end, start, close);
    }
  }

  let out = "";
  for (let i = 0; i < text.length; i++) {
    const closing = closeMap.get(i);
    if (closing && closing.length) {
      // Close later-opened first (larger start first)
      closing.sort((a, b) => b.start - a.start);
      for (const c of closing) out += c.tag;
    }
    const opening = openMap.get(i);
    if (opening && opening.length) {
      for (const o of opening) out += o;
    }
    out += escapeHtml(text[i]);
  }
  // Close tags that end exactly at text.length
  const tailClosing = closeMap.get(text.length);
  if (tailClosing && tailClosing.length) {
    tailClosing.sort((a, b) => b.start - a.start);
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

export function renderMessageHTML(msg: Message): { html: string; insights: string[] } {
  const lines: string[] = [];
  const text = msg.text ?? msg.caption ?? "";
  if (text) {
    const entities = msg.entities ?? msg.caption_entities;
    lines.push(entityToHtml(text, entities));
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

export function renderMediaGroupHTML(items: Message[]): { html: string } {
  const lines: string[] = [];
  const first = items[0];
  if (first?.caption) {
    lines.push(entityToHtml(first.caption, first.caption_entities));
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
