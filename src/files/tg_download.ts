import { join, basename } from "node:path";
import { writeFileSync } from "node:fs";
import { ensureDirFor } from "../utils/safe_fs.js";

export interface DownloadResult {
  localPath: string;
  mime?: string;
  size?: number;
  file_path?: string;
}

export const createTelegramFileDownloader = (api: any, token: string) => {
  if (!token) throw new Error("BOT_TOKEN is required for file downloads");

  const buildUrl = (filePath: string) => `https://api.telegram.org/file/${token}/${filePath}`;

  const downloadTo = async (fileId: string, destAbsPath?: string, suggestedName?: string): Promise<DownloadResult> => {
    const file = await api.getFile(fileId);
    const fp: string | undefined = (file as any)?.file_path;
    if (!fp) throw new Error("Telegram did not return file_path");
    const url = buildUrl(fp);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    let target = destAbsPath;
    if (!target) {
      const name = suggestedName || basename(fp);
      target = name; // caller should provide directory when omitting destAbsPath
    }
    ensureDirFor(target);
    const tmp = `${target}.${Date.now()}.tmp`;
    writeFileSync(tmp, buf);
    // atomic-ish rename
    const { renameSync } = await import("node:fs");
    renameSync(tmp, target);
    const mime = res.headers.get("content-type") || undefined;
    const size = Number.parseInt(res.headers.get("content-length") || "0", 10) || buf.length;
    return { localPath: target, mime, size, file_path: fp };
  };

  return { downloadTo };
};