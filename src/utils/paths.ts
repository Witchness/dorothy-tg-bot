import { join, dirname, relative, sep } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export const ensureDir = (dirPath: string) => {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
};

export const toPosixRelative = (absPath: string, baseDir: string): string => {
  const rel = relative(baseDir, absPath);
  return rel.split(sep).join("/");
};

export interface MessageDirParams {
  userId: string | number;
  messageId: string | number;
  dataDir?: string; // absolute path to data directory
}

export const buildMessageDir = (p: MessageDirParams) => {
  const dataDir = p.dataDir ?? join(process.cwd(), "data");
  const abs = join(dataDir, "messages", String(p.userId), String(p.messageId));
  ensureDir(abs);
  const rel = toPosixRelative(abs, process.cwd());
  return { abs, rel };
};