export const TELEGRAM_MESSAGE_LIMIT = 4096;

// Replace unpaired UTF-16 surrogate halves with the Unicode replacement character so Telegram accepts the payload.
export function toValidUnicode(source: string): string {
  if (!source) return "";
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += source[i] + source[i + 1];
        i += 1;
      } else {
        out += "\uFFFD";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
    } else {
      out += source[i];
    }
  }
  return out;
}

// Split a string into Telegram-safe chunks respecting Unicode code points.
export function splitForTelegram(source: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (limit <= 0) return source ? [source] : [""];
  const codepoints = Array.from(source);
  if (codepoints.length <= limit) return codepoints.length ? [source] : [""];
  const parts: string[] = [];
  for (let i = 0; i < codepoints.length; i += limit) {
    parts.push(codepoints.slice(i, i + limit).join(""));
  }
  return parts;
}
