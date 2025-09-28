const shorten = (s: string, n = 120) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
};

const maskPhone = (p?: string): string | undefined => {
  if (!p) return undefined;
  const sign = p.startsWith("+") ? "+" : "";
  const digits = p.replace(/[^\d]/g, "");
  if (digits.length <= 4) return sign + digits;
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  return `${sign}${head}${"*".repeat(Math.max(0, digits.length - 4))}${tail}`;
};

const formatBytes = (size?: number | string) => {
  if (!size && size !== 0) return "?";
  const v = typeof size === "string" ? Number(size) : size;
  if (!Number.isFinite(v as number)) return String(size ?? "?");
  const units = ["B", "KB", "MB", "GB", "TB"]; let n = v as number; let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
};

export function describeMessageKey(key: string, value: unknown): string {
  try {
    switch (key) {
      case "text":
      case "caption":
        return JSON.stringify(shorten(String(value ?? "")));
      case "photo": {
        const arr = Array.isArray(value) ? (value as any[]) : [];
        if (!arr.length) return "Photo: []";
        let maxW = 0, maxH = 0;
        for (const p of arr) {
          const w = Number(p?.width ?? 0);
          const h = Number(p?.height ?? 0);
          if (w * h > maxW * maxH) { maxW = w; maxH = h; }
        }
        return `Photo: x${arr.length}, max=${maxW}x${maxH}`;
      }
      case "sticker": {
        const s = value as any;
        const t = s?.type || (s?.is_video ? "video" : s?.is_animated ? "animated" : "regular");
        const emoji = s?.emoji ? `, emoji=${s.emoji}` : "";
        return `Sticker: type=${t}${emoji}`;
      }
      case "contact": {
        const c = value as any;
        const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
        const phone = maskPhone(c?.phone_number);
        return `Contact: ${name || "—"}${phone ? ", phone=" + phone : ""}`;
      }
      case "poll": {
        const p = value as any;
        const q = p?.question ? JSON.stringify(shorten(String(p.question), 60)) : '"(no question)"';
        const opts = Array.isArray(p?.options) ? p.options.length : 0;
        const anon = p?.is_anonymous === false ? "non-anonymous" : "anonymous";
        return `Poll: question=${q}, options=${opts}, ${anon}`;
      }
      case "video": {
        const v = value as any;
        const w = v?.width ?? "?"; const h = v?.height ?? "?"; const d = v?.duration ? `${v.duration}s` : "?s";
        const size = v?.file_size ? `, ${formatBytes(v.file_size)}` : "";
        const mime = v?.mime_type ? `, ${v.mime_type}` : "";
        return `Video: ${w}x${h}, ${d}${size}${mime}`;
      }
      case "video_note": {
        const vn = value as any;
        const len = vn?.length ?? "?"; const d = vn?.duration ? `${vn.duration}s` : "?s";
        const size = vn?.file_size ? `, ${formatBytes(vn.file_size)}` : "";
        return `Video Note: ${len}x${len}, ${d}${size}`;
      }
      case "voice": {
        const vv = value as any;
        const d = vv?.duration ? `${vv.duration}s` : "?s";
        const size = vv?.file_size ? `, ${formatBytes(vv.file_size)}` : "";
        const mime = vv?.mime_type ? `, ${vv.mime_type}` : "";
        return `Voice: ${d}${size}${mime}`;
      }
      case "document": {
        const d = value as any;
        const name = d?.file_name ? `, ${d.file_name}` : "";
        const size = d?.file_size ? `, ${formatBytes(d.file_size)}` : "";
        const mime = d?.mime_type ? `, ${d.mime_type}` : "";
        return `Document: ${size}${name}${mime}`;
      }
      case "animation": {
        const a = value as any;
        const w = a?.width ?? "?"; const h = a?.height ?? "?"; const d = a?.duration ? `${a.duration}s` : "?s";
        const size = a?.file_size ? `, ${formatBytes(a.file_size)}` : "";
        return `Animation: ${w}x${h}, ${d}${size}`;
      }
      case "audio": {
        const a = value as any;
        const d = a?.duration ? `${a.duration}s` : "?s";
        const size = a?.file_size ? `, ${formatBytes(a.file_size)}` : "";
        const what = [a?.performer, a?.title].filter(Boolean).join(" — ");
        return `Audio: ${d}${size}${what ? ", " + shorten(what, 40) : ""}`;
      }
      case "location": {
        const loc = value as any; const lat = loc?.latitude; const lon = loc?.longitude;
        return `Location: ${lat}, ${lon}`;
      }
      case "venue": {
        const v = value as any; const title = v?.title ?? "—"; const addr = v?.address ?? "";
        return `Venue: ${shorten(title, 40)}${addr ? ", " + shorten(addr, 40) : ""}`;
      }
      case "dice": {
        const d = (value as any)?.value ?? "?"; const e = (value as any)?.emoji ?? "🎲";
        return `Dice: ${e} ${d}`;
      }
      case "game": {
        const g = value as any; const title = g?.title ?? "game";
        return `Game: ${shorten(title, 40)}`;
      }
      case "invoice": {
        const i = value as any; const title = i?.title ?? "invoice"; const total = i?.total_amount ?? "?"; const cur = i?.currency ?? "?";
        return `Invoice: ${shorten(title, 40)}, ${total} ${cur}`;
      }
      case "successful_payment": {
        const sp = value as any; const total = sp?.total_amount ?? "?"; const cur = sp?.currency ?? "?";
        return `Payment: ${total} ${cur}`;
      }
      default:
        if (value === null) return "null";
        if (value === undefined) return "undefined";
        const t = typeof value;
        if (t === "string" || t === "number" || t === "boolean") return String(value);
        if (Array.isArray(value)) return `[array:${value.length}]`;
        if (t === "object") {
          const keys = Object.keys(value as any).slice(0, 6);
          return `Object(${keys.join(",")})`;
        }
        return String(value);
    }
  } catch {
    return String(value);
  }
}
