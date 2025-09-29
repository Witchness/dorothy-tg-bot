import { describe, expect, it } from "vitest";
import {
  buildPresentKeyboardForMessage,
  collectPresentPayloads,
  createPresentKeyboardBuilder,
  presentButtonLabelForKind,
  type PresentableMessage,
} from "../../src/presenter/present_keyboard.js";
import type { PresentPayload } from "../../src/presenter_replay.js";

describe("present keyboard builder", () => {
  const buildRecorder = () => {
    const calls: PresentPayload[] = [];
    let counter = 0;
    const builder = createPresentKeyboardBuilder((payload) => {
      calls.push(payload);
      counter += 1;
      return `id-${counter}`;
    });
    return { builder, calls };
  };

  it("returns null when no media is present", () => {
    const { builder, calls } = buildRecorder();
    const keyboard = builder({} as PresentableMessage);
    expect(keyboard).toBeNull();
    expect(calls).toEqual([]);
  });

  it("registers and labels each supported media type in order", () => {
    const { builder, calls } = buildRecorder();
    const message: PresentableMessage = {
      photo: [{ file_id: "p1" }, { file_id: "p2" }],
      video: { file_id: "v1" },
      document: { file_id: "d1", file_name: "file.pdf" },
      animation: { file_id: "a1" },
      audio: { file_id: "au1" },
      voice: { file_id: "vo1" },
      video_note: { file_id: "vn1" },
      sticker: { file_id: "s1" },
    };

    const keyboard = builder(message);
    expect(keyboard).not.toBeNull();
    expect(calls).toEqual([
      { kind: "photo", file_id: "p2" },
      { kind: "video", file_id: "v1" },
      { kind: "document", file_id: "d1" },
      { kind: "animation", file_id: "a1" },
      { kind: "audio", file_id: "au1" },
      { kind: "voice", file_id: "vo1" },
      { kind: "video_note", file_id: "vn1" },
      { kind: "sticker", file_id: "s1" },
    ]);

    expect(keyboard?.inline_keyboard).toEqual([
      [{ text: presentButtonLabelForKind("photo"), callback_data: "present|id-1" }],
      [{ text: presentButtonLabelForKind("video"), callback_data: "present|id-2" }],
      [{ text: `${presentButtonLabelForKind("document")} (file.pdf)`, callback_data: "present|id-3" }],
      [{ text: presentButtonLabelForKind("animation"), callback_data: "present|id-4" }],
      [{ text: presentButtonLabelForKind("audio"), callback_data: "present|id-5" }],
      [{ text: presentButtonLabelForKind("voice"), callback_data: "present|id-6" }],
      [{ text: presentButtonLabelForKind("video_note"), callback_data: "present|id-7" }],
      [{ text: presentButtonLabelForKind("sticker"), callback_data: "present|id-8" }],
    ]);
  });

  it("handles single attachment registrations", () => {
    const calls: PresentPayload[] = [];
    const keyboard = buildPresentKeyboardForMessage(
      { voice: { file_id: "voice-1" } },
      (payload) => {
        calls.push(payload);
        return "single";
      },
    );

    expect(calls).toEqual([{ kind: "voice", file_id: "voice-1" }]);
    expect(keyboard?.inline_keyboard).toEqual([
      [{ text: presentButtonLabelForKind("voice"), callback_data: "present|single" }],
    ]);
  });

  it("collects payloads for mixed attachments", () => {
    const message: PresentableMessage = {
      photo: [{ file_id: "p1" }],
      document: { file_id: "d1" },
    };

    expect(collectPresentPayloads(message)).toEqual([
      { kind: "photo", file_id: "p1" },
      { kind: "document", file_id: "d1" },
    ]);
  });
});
