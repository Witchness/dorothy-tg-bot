import type { BetterSqliteDatabase } from "./schema.js";

export interface Repository {
  upsertUser(user: {
    tg_id: number;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    is_bot?: boolean | null;
    language_code?: string | null;
    seen_at?: number | null;
  }): number; // returns id

  upsertChat(chat: {
    tg_id: number;
    type?: string | null;
    title?: string | null;
    username?: string | null;
    seen_at?: number | null;
  }): number; // returns id

  insertMessage(row: {
    tg_message_id: number;
    chat_id: number;
    user_id?: number | null;
    date?: number | null;
    scope?: string | null;
    has_text?: number | null;
    text_len?: number | null;
    json: string;
    files_dir?: string | null;
    media_group_id?: string | null;
    created_at?: number | null;
  }): number; // id

  insertAttachment(row: {
    message_id: number;
    kind?: string | null;
    file_id?: string | null;
    file_unique_id?: string | null;
    file_name?: string | null;
    mime?: string | null;
    size?: number | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    path?: string | null;
    created_at?: number | null;
  }): number; // id

  insertEvent(kind: string, payload: unknown): void;
  insertError(scope: string, err: unknown, context?: unknown, message_id?: number | null): void;
  insertSchemaRequest(req: { label: string; keys: string[]; requested_by?: string | number | null }): void;
}

export function createRepository(db: BetterSqliteDatabase): Repository {
  const upsertUserStmt = db.prepare(`
    INSERT INTO users (tg_id, username, first_name, last_name, is_bot, language_code, seen_at, created_at, updated_at)
    VALUES (@tg_id, @username, @first_name, @last_name, @is_bot, @language_code, @seen_at, @now, @now)
    ON CONFLICT(tg_id) DO UPDATE SET
      username=excluded.username,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      is_bot=excluded.is_bot,
      language_code=excluded.language_code,
      seen_at=excluded.seen_at,
      updated_at=excluded.updated_at
    RETURNING id;
  `);

  const upsertChatStmt = db.prepare(`
    INSERT INTO chats (tg_id, type, title, username, seen_at, created_at, updated_at)
    VALUES (@tg_id, @type, @title, @username, @seen_at, @now, @now)
    ON CONFLICT(tg_id) DO UPDATE SET
      type=excluded.type,
      title=excluded.title,
      username=excluded.username,
      seen_at=excluded.seen_at,
      updated_at=excluded.updated_at
    RETURNING id;
  `);

  const insertMessageStmt = db.prepare(`
    INSERT INTO messages (tg_message_id, chat_id, user_id, date, scope, has_text, text_len, json, files_dir, media_group_id, created_at)
    VALUES (@tg_message_id, @chat_id, @user_id, @date, @scope, @has_text, @text_len, @json, @files_dir, @media_group_id, @created_at)
  `);

  const insertAttachmentStmt = db.prepare(`
    INSERT INTO attachments (message_id, kind, file_id, file_unique_id, file_name, mime, size, width, height, duration, path, created_at)
    VALUES (@message_id, @kind, @file_id, @file_unique_id, @file_name, @mime, @size, @width, @height, @duration, @path, @created_at)
  `);

  const insertEventStmt = db.prepare(`
    INSERT INTO events (kind, payload, created_at) VALUES (@kind, @payload, @created_at)
  `);

  const insertErrorStmt = db.prepare(`
    INSERT INTO errors (message_id, code, description, details, created_at) VALUES (@message_id, @code, @description, @details, @created_at)
  `);

  const insertSchemaRequestStmt = db.prepare(`
    INSERT INTO schema_requests (label, keys, requested_by, created_at)
    VALUES (@label, @keys, @requested_by, @created_at)
  `);

  const now = () => Date.now();

  return {
    upsertUser(u) {
      const row = { ...u, now: now() };
      const res = upsertUserStmt.get(row) as { id: number };
      return res.id;
    },

    upsertChat(c) {
      const row = { ...c, now: now() };
      const res = upsertChatStmt.get(row) as { id: number };
      return res.id;
    },

    insertMessage(m) {
      const created_at = m.created_at ?? now();
      const info = insertMessageStmt.run({ ...m, created_at });
      return info.lastInsertRowid as number;
    },

    insertAttachment(a) {
      const created_at = a.created_at ?? now();
      const info = insertAttachmentStmt.run({ ...a, created_at });
      return info.lastInsertRowid as number;
    },

    insertEvent(kind, payload) {
      insertEventStmt.run({ kind, payload: JSON.stringify(payload ?? null), created_at: now() });
    },

    insertError(scope, err, context, message_id = null) {
      const code = (err as any)?.code ?? scope;
      const description = (err as any)?.message ?? String(err);
      const details = JSON.stringify({ scope, err, context });
      insertErrorStmt.run({ message_id, code, description, details, created_at: now() });
    },

    insertSchemaRequest(req) {
      insertSchemaRequestStmt.run({
        label: req.label,
        keys: JSON.stringify(req.keys ?? []),
        requested_by: req.requested_by ?? null,
        created_at: now(),
      });
    },
  };
}
