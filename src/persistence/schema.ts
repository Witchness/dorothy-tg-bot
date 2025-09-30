import { join, dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

export type BetterSqliteDatabase = any; // runtime-loaded to avoid hard dependency in dev mode

export interface OpenDbOptions {
  dbFilePath?: string; // absolute path
}

export const defaultDbPath = () => join(process.cwd(), "data", "db", "main.sqlite");

export async function openDatabase(opts: OpenDbOptions = {}): Promise<BetterSqliteDatabase> {
  const dbPath = opts.dbFilePath ?? defaultDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const mod = await import("better-sqlite3");
  const Database = (mod as any).default ?? (mod as any);
  const db: BetterSqliteDatabase = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate(db: BetterSqliteDatabase): void {
  // idempotent migrations (basic bootstrap)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      is_bot INTEGER,
      language_code TEXT,
      seen_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER NOT NULL UNIQUE,
      type TEXT,
      title TEXT,
      username TEXT,
      seen_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_message_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      user_id INTEGER,
      date INTEGER,
      scope TEXT,
      has_text INTEGER,
      text_len INTEGER,
      json TEXT NOT NULL,
      files_dir TEXT,
      media_group_id TEXT,
      created_at INTEGER,
      FOREIGN KEY(chat_id) REFERENCES chats(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      kind TEXT,
      file_id TEXT,
      file_unique_id TEXT,
      file_name TEXT,
      mime TEXT,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      duration INTEGER,
      path TEXT,
      created_at INTEGER,
      FOREIGN KEY(message_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT,
      payload TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER,
      code TEXT,
      description TEXT,
      details TEXT,
      created_at INTEGER,
      FOREIGN KEY(message_id) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS schema_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      keys TEXT,
      requested_by TEXT,
      created_at INTEGER
    );
  `);
}