import { join, basename } from "node:path";
import { writeFileSync } from "node:fs";
import { ensureDirFor } from "../utils/safe_fs.js";

const DEBUG = ((process.env.DEBUG ?? process.env.LOG_LEVEL ?? "").trim().toLowerCase() === "debug");
const dbg = (...args: any[]) => { if (DEBUG) { try { console.log("[tg-download]", ...args); } catch {} } };

export interface DownloadResult {
  localPath: string;
  mime?: string;
  size?: number;
  file_path?: string;
}

export const createTelegramFileDownloader = (api: any, token: string) => {
  if (!token) {
    const err = new Error("CRITICAL: BOT_TOKEN is required for file downloads");
    console.error(err.message);
    throw err;
  }

  const buildUrl = (filePath: string) => `https://api.telegram.org/file/bot${token}/${filePath}`;

  const downloadTo = async (fileId: string, destAbsPath?: string, suggestedName?: string): Promise<DownloadResult> => {
    dbg(`downloadTo: fileId=${fileId} dest=${destAbsPath} suggested=${suggestedName}`);
    try {
      const file = await api.getFile(fileId);
      const fp: string | undefined = (file as any)?.file_path;
      if (!fp) {
        const err = new Error(`CRITICAL: Telegram did not return file_path for fileId=${fileId}`);
        console.error(err.message, { file });
        throw err;
      }
      dbg(`getFile OK: fileId=${fileId} -> file_path=${fp}`);
      const url = buildUrl(fp);
      dbg(`fetching: ${url}`);

      const res = await fetch(url);
      if (!res.ok) {
        const err = new Error(`CRITICAL: Download failed: ${res.status} ${res.statusText} for fileId=${fileId}`);
        console.error(err.message);
        throw err;
      }
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      dbg(`fetched ${buf.length} bytes for fileId=${fileId}`);

      let target = destAbsPath;
      if (!target) {
        const name = suggestedName || basename(fp);
        target = name; // caller should provide directory when omitting destAbsPath
      }
      dbg(`target path: ${target}`);
      try {
        ensureDirFor(target);
        dbg(`ensured dir for ${target}`);
      } catch (e) {
        console.error(`[tg-download] CRITICAL: Failed to ensure directory for ${target}`, e);
        throw e;
      }
      const tmp = `${target}.${Date.now()}.tmp`;
      try {
        writeFileSync(tmp, buf);
        dbg(`wrote temp file ${tmp} (${buf.length} bytes)`);
      } catch (e) {
        console.error(`[tg-download] CRITICAL: Failed to write temp file ${tmp}`, e);
        throw e;
      }
      // atomic-ish rename
      try {
        const { renameSync } = await import("node:fs");
        renameSync(tmp, target);
        dbg(`renamed ${tmp} -> ${target}`);
      } catch (e) {
        console.error(`[tg-download] CRITICAL: Failed to rename ${tmp} -> ${target}`, e);
        throw e;
      }
      const mime = res.headers.get("content-type") || undefined;
      const size = Number.parseInt(res.headers.get("content-length") || "0", 10) || buf.length;
      console.info(`[tg-download] SUCCESS: fileId=${fileId} -> ${target} (${size} bytes, mime=${mime ?? 'unknown'})`);
      return { localPath: target, mime, size, file_path: fp };
    } catch (e) {
      console.error(`[tg-download] CRITICAL FAILURE: fileId=${fileId}`, e);
      throw e;
    }
  };

  return { downloadTo };
};
