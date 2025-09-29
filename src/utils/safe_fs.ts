import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export const ensureDirFor = (filePath: string) => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

export const writeFileAtomic = (filePath: string, contents: string) => {
  ensureDirFor(filePath);
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, contents, "utf8");
  renameSync(tempPath, filePath);
};
