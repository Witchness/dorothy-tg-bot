import { InlineKeyboard } from "grammy";
import type { PresentPayload } from "../presenter_replay.js";

export type PresentActionRegistrar = (payload: PresentPayload) => string;

export type PresentableMessage = {
  photo?: Array<{ file_id?: string }>;
  video?: { file_id?: string };
  document?: { file_id?: string; file_name?: string };
  animation?: { file_id?: string };
  audio?: { file_id?: string };
  voice?: { file_id?: string };
  video_note?: { file_id?: string };
  sticker?: { file_id?: string };
};

interface PresentButtonDefinition {
  label: string;
  payload: PresentPayload;
}

const PRESENT_BUTTON_LABELS: Record<PresentPayload["kind"], string> = {
  photo: "📷 Фото",
  video: "🎬 Відео",
  document: "📄 Документ",
  animation: "🖼️ GIF",
  audio: "🎵 Аудіо",
  voice: "🎤 Голос",
  video_note: "🟡 Відео-нота",
  sticker: "🔖 Стікер",
};

const buildPresentButtonDefinitions = (message: PresentableMessage): PresentButtonDefinition[] => {
  const buttons: PresentButtonDefinition[] = [];
  const add = (label: string, payload: PresentPayload) => {
    buttons.push({ label, payload });
  };

  if (Array.isArray(message.photo) && message.photo.length) {
    const largest = message.photo[message.photo.length - 1];
    if (largest?.file_id) {
      add(PRESENT_BUTTON_LABELS.photo, { kind: "photo", file_id: largest.file_id });
    }
  }

  if (message.video?.file_id) {
    add(PRESENT_BUTTON_LABELS.video, { kind: "video", file_id: message.video.file_id });
  }

  if (message.document?.file_id) {
    const name = message.document.file_name ? ` (${message.document.file_name})` : "";
    add(`${PRESENT_BUTTON_LABELS.document}${name}`, {
      kind: "document",
      file_id: message.document.file_id,
    });
  }

  if (message.animation?.file_id) {
    add(PRESENT_BUTTON_LABELS.animation, { kind: "animation", file_id: message.animation.file_id });
  }

  if (message.audio?.file_id) {
    add(PRESENT_BUTTON_LABELS.audio, { kind: "audio", file_id: message.audio.file_id });
  }

  if (message.voice?.file_id) {
    add(PRESENT_BUTTON_LABELS.voice, { kind: "voice", file_id: message.voice.file_id });
  }

  if (message.video_note?.file_id) {
    add(PRESENT_BUTTON_LABELS.video_note, { kind: "video_note", file_id: message.video_note.file_id });
  }

  if (message.sticker?.file_id) {
    add(PRESENT_BUTTON_LABELS.sticker, { kind: "sticker", file_id: message.sticker.file_id });
  }

  return buttons;
};

export const collectPresentPayloads = (message: PresentableMessage): PresentPayload[] =>
  buildPresentButtonDefinitions(message).map((entry) => entry.payload);

export const buildPresentKeyboardForMessage = (
  message: PresentableMessage,
  registerPresentAction: PresentActionRegistrar,
): InlineKeyboard | null => {
  const buttons = buildPresentButtonDefinitions(message);
  if (buttons.length === 0) return null;

  const keyboard = new InlineKeyboard();
  buttons.forEach(({ label, payload }, index) => {
    const id = registerPresentAction(payload);
    keyboard.text(label, `present|${id}`);
    if (index < buttons.length - 1) {
      keyboard.row();
    }
  });

  return keyboard;
};

export const createPresentKeyboardBuilder = (registerPresentAction: PresentActionRegistrar) =>
  (message: PresentableMessage) => buildPresentKeyboardForMessage(message, registerPresentAction);

export type PresentKeyboardBuilder = ReturnType<typeof createPresentKeyboardBuilder>;

export const presentButtonLabelForKind = (kind: PresentPayload["kind"]): string => PRESENT_BUTTON_LABELS[kind];
