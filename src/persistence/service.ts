import type { Repository } from "./repo.js";
import { writeFileAtomic } from "../utils/safe_fs.js";
import { toPosixRelative } from "../utils/paths.js";
import { join } from "node:path";

const DEBUG = ((process.env.DEBUG ?? process.env.LOG_LEVEL ?? "").trim().toLowerCase() === "debug");
const dbg = (...args: any[]) => { if (DEBUG) { try { console.log("[persist]", ...args); } catch {} } };

export interface ReactionsAdapter {
  ok(ctx: unknown): Promise<void> | void;
  fail(ctx: unknown): Promise<void> | void;
}

export interface PathBuilder {
  (params: { userId: number | string; messageId: number | string }): { abs: string; rel: string };
}

export interface FileDownloader {
  downloadTo: (fileId: string, destAbsPath: string, suggestedName?: string) => Promise<{ localPath: string; mime?: string; size?: number; file_path?: string }>;
}

export interface PersistenceServiceDeps {
  repo: Repository;
  pathBuilder: PathBuilder;
  reactions: ReactionsAdapter;
  fileDownloader: FileDownloader;
  dataDirAbs?: string; // absolute path to data/
}

export interface SaveOk {
  ok: true;
  filesDir?: string;
}
export interface SaveFail {
  ok: false;
  error: Error;
}

export type SaveResult = SaveOk | SaveFail;

export interface DownloadedFile {
  localPath: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  tgFileId?: string;
  fileUniqueId?: string;
  kind?: string;
  suggestedName?: string;
}

export function createPersistenceService(deps: PersistenceServiceDeps) {
  const repo = deps.repo;

  function pickPhotoFileId(photoArr: any[] | undefined): { file_id: string; width?: number; height?: number } | null {
    if (!Array.isArray(photoArr) || photoArr.length === 0) return null;
    let best: any = photoArr[0];
    let bestScore = (best.width || 0) * (best.height || 0);
    for (const p of photoArr) {
      const score = (p.width || 0) * (p.height || 0);
      if (score >= bestScore) { best = p; bestScore = score; }
    }
    return { file_id: best.file_id, width: best.width, height: best.height };
  }

  async function saveMessage(ctx: any, message: any, files?: DownloadedFile[]): Promise<SaveResult> {
    const msgId = message?.message_id;
    const chatId = message?.chat?.id;
    try {
      const userId: number | undefined = message?.from?.id;
      if (!chatId || !msgId) {
        const err = new Error("CRITICAL: message has no chat.id or message_id");
        console.error(`[persist.saveMessage] ${err.message}`, { chatId, msgId, message });
        throw err;
      }

      // Prepare FS dir
      const { abs: messageDirAbs, rel: messageDirRel } = deps.pathBuilder({ userId: userId ?? 0, messageId: msgId });
      dbg(`message ${msgId} chat=${chatId} user=${userId ?? '-'} dirAbs=${messageDirAbs} dirRel=${messageDirRel}`);

      // Persist users/chats
      let userRowId: number | null = null;
      if (userId) {
        try {
          userRowId = repo.upsertUser({
            tg_id: userId,
            username: message?.from?.username ?? null,
            first_name: message?.from?.first_name ?? null,
            last_name: message?.from?.last_name ?? null,
            is_bot: message?.from?.is_bot ? 1 : 0,
            language_code: message?.from?.language_code ?? null,
            seen_at: Date.now(),
          });
          if (!userRowId) {
            console.error(`[persist.saveMessage] CRITICAL: upsertUser returned null/undefined for tg_id=${userId}`);
          } else {
            dbg(`upserted user tg_id=${userId} -> row_id=${userRowId}`);
          }
        } catch (e) {
          console.error(`[persist.saveMessage] CRITICAL: Failed to upsert user tg_id=${userId}`, e);
          throw e;
        }
      }
      let chatRowId: number;
      try {
        chatRowId = repo.upsertChat({
          tg_id: chatId,
          type: message?.chat?.type ?? null,
          title: message?.chat?.title ?? null,
          username: message?.chat?.username ?? null,
          seen_at: Date.now(),
        });
        if (!chatRowId) {
          const err = new Error(`CRITICAL: upsertChat returned null/undefined for tg_id=${chatId}`);
          console.error(`[persist.saveMessage] ${err.message}`);
          throw err;
        }
        dbg(`upserted chat tg_id=${chatId} -> row_id=${chatRowId}`);
      } catch (e) {
        console.error(`[persist.saveMessage] CRITICAL: Failed to upsert chat tg_id=${chatId}`, e);
        throw e;
      }

      // Write messages.json with full Telegram message
      const jsonPathAbs = join(messageDirAbs, "messages.json");
      try {
        writeFileAtomic(jsonPathAbs, JSON.stringify(message, null, 2));
        dbg(`wrote messages.json -> ${jsonPathAbs}`);
      } catch (e) {
        console.error(`[persist.saveMessage] CRITICAL: Failed to write messages.json to ${jsonPathAbs}`, e);
        throw e;
      }

      // Insert message row
      const text: string | undefined = message?.text ?? message?.caption;
      const hasText = !!text;
      const textLen = typeof text === "string" ? Array.from(text).length : null;
      const mediaGroupId: string | undefined = message?.media_group_id;

      let messageId: number;
      try {
        messageId = repo.insertMessage({
          tg_message_id: msgId,
          chat_id: chatRowId,
          user_id: userRowId,
          date: (message?.date ? message.date * 1000 : Date.now()),
          scope: "message",
          has_text: hasText ? 1 : 0,
          text_len: textLen ?? null,
          json: JSON.stringify(message),
          files_dir: messageDirRel,
          media_group_id: mediaGroupId ?? null,
        });
        if (!messageId) {
          const err = new Error(`CRITICAL: insertMessage returned null/undefined for tg_message_id=${msgId}`);
          console.error(`[persist.saveMessage] ${err.message}`);
          throw err;
        }
        dbg(`inserted message tg_message_id=${msgId} -> row_id=${messageId}`);
      } catch (e) {
        console.error(`[persist.saveMessage] CRITICAL: Failed to insert message tg_message_id=${msgId}`, e);
        throw e;
      }

      // Persist attachments: either provided or derive from message and download
      const toPersist: DownloadedFile[] = [];
      if (Array.isArray(files)) {
        toPersist.push(...files);
      } else {
        // Detect attachments from message
        const m: any = message;
        const candidates: Array<() => Promise<DownloadedFile | null>> = [];
        // photo
        const bestPhoto = pickPhotoFileId(m.photo);
        if (bestPhoto) {
          candidates.push(async () => {
            const name = `photo_${msgId}.jpg`;
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(bestPhoto.file_id, abs, name);
            dbg(`downloaded photo -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime, size: res.size, width: bestPhoto.width, height: bestPhoto.height, tgFileId: bestPhoto.file_id, kind: "photo", suggestedName: name };
          });
        }
        // document (skip if it's an animation, we handle those separately)
        if (m.document?.file_id && !m.animation?.file_id) {
          candidates.push(async () => {
            const orig = m.document.file_name as string | undefined;
            let name = orig;
            if (!name) {
              // Guess extension from mime_type
              const mimeType = m.document.mime_type as string | undefined;
              let ext = "";
              if (mimeType?.includes("pdf")) ext = ".pdf";
              else if (mimeType?.includes("zip")) ext = ".zip";
              else if (mimeType?.includes("json")) ext = ".json";
              else if (mimeType?.includes("text")) ext = ".txt";
              else if (mimeType?.includes("image")) ext = ".jpg";
              else if (mimeType?.includes("video")) ext = ".mp4";
              name = `document_${msgId}${ext}`;
            }
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(m.document.file_id, abs, name);
            dbg(`downloaded document -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime || m.document.mime_type, size: res.size, tgFileId: m.document.file_id, fileUniqueId: m.document.file_unique_id, kind: "document", suggestedName: name };
          });
        }
        // video
        if (m.video?.file_id) {
          candidates.push(async () => {
            const name = `video_${msgId}.mp4`;
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(m.video.file_id, abs, name);
            dbg(`downloaded video -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime || m.video.mime_type, size: res.size, width: m.video.width, height: m.video.height, duration: m.video.duration, tgFileId: m.video.file_id, fileUniqueId: m.video.file_unique_id, kind: "video", suggestedName: name };
          });
        }
        // animation
        if (m.animation?.file_id) {
          candidates.push(async () => {
            const name = `animation_${msgId}.mp4`;
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(m.animation.file_id, abs, name);
            dbg(`downloaded animation -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime || m.animation.mime_type, size: res.size, width: m.animation.width, height: m.animation.height, duration: m.animation.duration, tgFileId: m.animation.file_id, fileUniqueId: m.animation.file_unique_id, kind: "animation", suggestedName: name };
          });
        }
        // audio
        if (m.audio?.file_id) {
          candidates.push(async () => {
            const name = m.audio.file_name || `audio_${msgId}.mp3`;
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(m.audio.file_id, abs, name);
            dbg(`downloaded audio -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime || m.audio.mime_type, size: res.size, duration: m.audio.duration, tgFileId: m.audio.file_id, fileUniqueId: m.audio.file_unique_id, kind: "audio", suggestedName: name };
          });
        }
        // voice
        if (m.voice?.file_id) {
          candidates.push(async () => {
            const name = `voice_${msgId}.ogg`;
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(m.voice.file_id, abs, name);
            dbg(`downloaded voice -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime || m.voice.mime_type, size: res.size, duration: m.voice.duration, tgFileId: m.voice.file_id, fileUniqueId: m.voice.file_unique_id, kind: "voice", suggestedName: name };
          });
        }
        // sticker (static/animated)
        if (m.sticker?.file_id) {
          candidates.push(async () => {
            const ext = m.sticker.is_animated ? ".tgs" : m.sticker.is_video ? ".webm" : ".webp";
            const name = `sticker_${msgId}${ext}`;
            const abs = join(messageDirAbs, name);
            const res = await deps.fileDownloader.downloadTo(m.sticker.file_id, abs, name);
            dbg(`downloaded sticker -> ${res.localPath}`);
            return { localPath: res.localPath, mime: res.mime, size: res.size, width: m.sticker.width, height: m.sticker.height, tgFileId: m.sticker.file_id, fileUniqueId: m.sticker.file_unique_id, kind: "sticker", suggestedName: name };
          });
        }

        for (const job of candidates) {
          try {
            const f = await job();
            if (f) {
              toPersist.push(f);
              dbg(`download OK: ${f.kind} -> ${f.localPath}`);
            } else {
              console.warn(`[persist.download] job returned null/undefined for msgId=${msgId}`);
            }
          } catch (e) {
            console.error(`[persist.download] CRITICAL: Failed to download attachment for msgId=${msgId}`, e);
            try { repo.insertError("persistence.download", e, { msgId }); } catch {}
          }
        }
      }

      if (toPersist.length) {
        dbg(`attachments: ${toPersist.length}`);
        for (const f of toPersist) {
          try {
            const rel = toPosixRelative(f.localPath, process.cwd());
            const attRowId = repo.insertAttachment({
              message_id: messageId,
              kind: f.kind ?? null,
              file_id: f.tgFileId ?? null,
              file_unique_id: f.fileUniqueId ?? null,
              file_name: f.suggestedName ?? null,
              mime: f.mime ?? null,
              size: f.size ?? null,
              width: f.width ?? null,
              height: f.height ?? null,
              duration: f.duration ?? null,
              path: rel,
            });
            if (!attRowId) {
              console.error(`[persist.saveMessage] CRITICAL: insertAttachment returned null/undefined for file ${f.kind}`);
            } else {
              dbg(`persisted attachment kind=${f.kind ?? "?"} path=${rel} -> row_id=${attRowId}`);
            }
          } catch (e) {
            console.error(`[persist.saveMessage] CRITICAL: Failed to insert attachment kind=${f.kind ?? "?"} path=${f.localPath}`, e);
            throw e;
          }
        }
      }

      await Promise.resolve(deps.reactions.ok(ctx));
      console.info(`[persist.saveMessage] SUCCESS: msg=${msgId} chat=${chatId} attachments=${toPersist.length}`);
      return { ok: true, filesDir: messageDirAbs } as SaveOk;
    } catch (e) {
      console.error(`[persist.saveMessage] CRITICAL FAILURE: msg=${msgId ?? '?'} chat=${chatId ?? '?'}`, e);
      try { deps.repo.insertError("persistence.saveMessage", e, { where: "saveMessage", msgId, chatId }); } catch (errLog) {
        console.error(`[persist.saveMessage] Failed to log error to DB`, errLog);
      }
      try { await Promise.resolve(deps.reactions.fail(ctx)); } catch (reactErr) {
        console.error(`[persist.saveMessage] Failed to set fail reaction`, reactErr);
      }
      return { ok: false, error: e as Error } as SaveFail;
    }
  }

  return { saveMessage };
}