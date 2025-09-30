import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDirFor } from "../utils/safe_fs.js";

export interface SchemaRequestItem {
  label: string;
  keys: string[];
  requested_by?: number | string | null;
  ts?: string;
}

export const SCHEMA_REQUESTS_PATH = process.env.SCHEMA_REQUESTS_PATH
  ? resolve(process.env.SCHEMA_REQUESTS_PATH)
  : resolve(process.cwd(), "data", "schema-requests.jsonl");

export function appendSchemaRequest(item: SchemaRequestItem): void {
  const payload = {
    ...item,
    ts: item.ts ?? new Date().toISOString(),
  };
  ensureDirFor(SCHEMA_REQUESTS_PATH);
  appendFileSync(SCHEMA_REQUESTS_PATH, `${JSON.stringify(payload)}\n`, { encoding: "utf8" });
}