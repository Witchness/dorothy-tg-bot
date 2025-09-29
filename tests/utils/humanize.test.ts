import { describe, expect, it } from "vitest";
import { describeMessageKey } from "../../src/humanize.js";

describe("describeMessageKey", () => {
  it("summarizes textual keys", () => {
    expect(describeMessageKey("text", "hello\nworld")).toBe('"hello world"');
    expect(describeMessageKey("caption", "a".repeat(130))).toMatch(/^"a{120}…"$/);
  });

  it("handles media collections", () => {
    const photo = describeMessageKey("photo", [
      { width: 100, height: 100 },
      { width: 300, height: 250 },
    ]);
    expect(photo).toBe("Photo: x2, max=300x250");
    expect(describeMessageKey("photo", [])).toBe("Photo: []");
  });

  it("covers attachment summaries", () => {
    expect(describeMessageKey("sticker", { type: "regular", emoji: "😀" })).toBe("Sticker: type=regular, emoji=😀");
    expect(describeMessageKey("contact", { first_name: "Ada", phone_number: "+123456789" })).toContain("phone=+12*****89");
    expect(describeMessageKey("poll", { question: "Q?", options: [1, 2], is_anonymous: false }))
      .toBe("Poll: question=\"Q?\", options=2, non-anonymous");
    expect(describeMessageKey("video", { width: 1920, height: 1080, duration: 5, file_size: 2048, mime_type: "video/mp4" }))
      .toBe("Video: 1920x1080, 5s, 2.0 KB, video/mp4");
    expect(describeMessageKey("video_note", { length: 240, duration: 5, file_size: 2048 }))
      .toBe("Video Note: 240x240, 5s, 2.0 KB");
    expect(describeMessageKey("voice", { duration: 5, file_size: 1024, mime_type: "audio/ogg" }))
      .toBe("Voice: 5s, 1.0 KB, audio/ogg");
    expect(describeMessageKey("document", { file_name: "doc.pdf", file_size: 4096, mime_type: "application/pdf" }))
      .toBe("Document: , 4.0 KB, doc.pdf, application/pdf");
    expect(describeMessageKey("animation", { width: 320, height: 240, duration: 3, file_size: 1024 }))
      .toBe("Animation: 320x240, 3s, 1.0 KB");
    expect(describeMessageKey("audio", { duration: 180, file_size: 1024, performer: "Artist", title: "Song" }))
      .toBe("Audio: 180s, 1.0 KB, Artist — Song");
  });

  it("summarizes service payloads", () => {
    expect(describeMessageKey("location", { latitude: 50.5, longitude: 30.5 }))
      .toBe("Location: 50.5, 30.5");
    expect(describeMessageKey("venue", { title: "Cafe", address: "Street" }))
      .toBe("Venue: Cafe, Street");
    expect(describeMessageKey("dice", { emoji: "🎯", value: 6 })).toBe("Dice: 🎯 6");
    expect(describeMessageKey("game", { title: "Chess" })).toBe("Game: Chess");
    expect(describeMessageKey("invoice", { title: "Pro", total_amount: 1000, currency: "UAH" }))
      .toBe("Invoice: Pro, 1000 UAH");
    expect(describeMessageKey("successful_payment", { total_amount: 1000, currency: "UAH" }))
      .toBe("Payment: 1000 UAH");
  });

  it("falls back to sensible defaults", () => {
    expect(describeMessageKey("unknown", null)).toBe("null");
    expect(describeMessageKey("unknown", undefined)).toBe("undefined");
    expect(describeMessageKey("unknown", 42)).toBe("42");
    expect(describeMessageKey("unknown", [1, 2, 3])).toBe("[array:3]");
    expect(describeMessageKey("unknown", { a: 1, b: 2 })).toBe("Object(a,b)");
  });
});
