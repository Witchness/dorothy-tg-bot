import { beforeEach, describe, expect, it, vi } from "vitest";

const recordMessageKeys = vi.fn(() => [] as string[]);
const recordPayloadKeys = vi.fn(() => [] as string[]);
const recordEntityType = vi.fn(() => false);
const storeUnhandledSample = vi.fn(() => null as any);

vi.mock("../../src/entity_registry.js", () => ({
  recordMessageKeys,
  recordPayloadKeys,
  recordEntityType,
}));

vi.mock("../../src/unhandled_logger.js", () => ({
  storeUnhandledSample,
}));

beforeEach(() => {
  vi.resetModules();
  recordMessageKeys.mockReset();
  recordMessageKeys.mockImplementation(() => []);
  recordPayloadKeys.mockReset();
  recordPayloadKeys.mockImplementation(() => []);
  recordEntityType.mockReset();
  recordEntityType.mockImplementation(() => false);
  storeUnhandledSample.mockReset();
  storeUnhandledSample.mockImplementation(() => null);
});

describe("analyzeMessage", () => {
  it("produces rich summary with alerts", async () => {
    recordMessageKeys.mockReturnValueOnce(["text"]);
    storeUnhandledSample.mockReturnValueOnce({ signature: "sig1" });
    recordPayloadKeys.mockReturnValue([]);

    const { analyzeMessage } = await import("../../src/analyzer.js");
    const summary = analyzeMessage({
      message_id: 1,
      date: 0,
      text: "/start Hello world! visit example.com",
      entities: [
        { type: "bot_command", offset: 0, length: 6 },
        { type: "url", offset: 20, length: 11 },
      ],
      business_connection_id: "abc",
      photo: [{ width: 640, height: 480, file_size: 2048 }],
      document: { file_name: "doc.pdf", file_size: 4096 },
      video: { width: 1920, height: 1080, file_size: 4096 },
      animation: { width: 320, height: 240, file_size: 1024 },
      audio: { duration: 180, file_size: 5120, performer: "Artist", title: "Title" },
      voice: { duration: 5, file_size: 1024 },
      video_note: { length: 240, duration: 6 },
      sticker: { emoji: "😀" },
      contact: { first_name: "Ada" },
      location: { latitude: 50.45, longitude: 30.52 },
      venue: { title: "Cafe", address: "Street" },
      poll: { question: "Which?" },
      dice: { emoji: "🎲", value: 5 },
      story: {},
      reply_to_story: {},
      giveaway: {},
      paid_media: {},
      reply_to_message: { text: "Prev" },
      forward_origin: { type: "user", sender_user: { first_name: "Bob" } },
      message_thread_id: 42,
      via_bot: { username: "helper" },
      link_preview_options: { is_disabled: true },
      paid_star_count: 3,
      reactions: { total_count: 1 },
      reaction: { type: "emoji" },
    } as any);

    expect(summary.textSection).toContain("📝 Текст");
    expect(summary.entitiesSection).toContainEqual(expect.stringContaining("Команди"));
    expect(summary.entitiesSection).toContainEqual(expect.stringContaining("Посилання"));
    expect(summary.attachments?.length).toBeGreaterThan(3);
    expect(summary.meta?.some((line) => line.includes("Переслано"))).toBe(true);
    expect(summary.meta).toEqual(expect.arrayContaining([
      expect.stringContaining("Thread ID: 42"),
      expect.stringContaining("@helper"),
    ]));
    expect(summary.service).toEqual(expect.arrayContaining([
      "Бізнес-повідомлення",
      "Оплачено Stars: 3",
      "Реакції присутні",
      "Підрахунок реакцій",
    ]));
    expect(summary.alerts).toContain("New message keys observed: text");
    expect(recordMessageKeys).toHaveBeenCalled();
    expect(recordPayloadKeys).toHaveBeenCalled();
  });

  it("summarizes empty payload gracefully", async () => {
    const { analyzeMessage } = await import("../../src/analyzer.js");
    const summary = analyzeMessage({ message_id: 1, date: 0 } as any);
    expect(summary.textSection).toBe("Повідомлення не містить даних для аналізу.");
    expect(summary.alerts).toBeUndefined();
  });
});

describe("formatAnalysis", () => {
  it("renders multiline summary", async () => {
    const { formatAnalysis } = await import("../../src/analyzer.js");
    const text = formatAnalysis({
      textSection: "main",
      nlpSection: ["summary"],
      entitiesSection: ["Команди: /start"],
      linkInsights: ["Link → example.com"],
      attachments: [{ label: "Фото" }],
      meta: ["meta"],
      service: ["service"],
    });
    expect(text).toContain("main");
    expect(text).toContain("🧠 Insights");
    expect(text).toContain("📎 Вкладення");
    expect(text).toContain("⚙️ Службова інформація:");
  });
});

describe("analyzeMediaGroup", () => {
  it("aggregates album data and deduplicates service flags", async () => {
    recordMessageKeys.mockReturnValueOnce(["caption"]);
    storeUnhandledSample.mockReturnValueOnce({ signature: "sig-album" });
    const { analyzeMediaGroup } = await import("../../src/analyzer.js");
    const summary = analyzeMediaGroup([
      {
        caption: "Hello",
        caption_entities: [{ type: "url", offset: 0, length: 5 }],
        photo: [{ width: 100, height: 100 }],
        business_connection_id: "1",
        paid_star_count: 1,
      },
      {
        caption: "",
        video: { width: 10, height: 10 },
        reactions: {},
        reaction: {},
      },
    ] as any);

    expect(summary.textSection).toContain("📝 Текст");
    expect(summary.entitiesSection).toContainEqual(expect.stringContaining("Посилання"));
    expect(summary.attachments?.length).toBe(2);
    expect(summary.service).toContain("Бізнес-повідомлення");
    expect(summary.service).toContain("Оплачено Stars: 1");
    expect(summary.alerts?.some((line) => line.includes("caption"))).toBe(true);
  });

  it("handles empty album", async () => {
    const { analyzeMediaGroup } = await import("../../src/analyzer.js");
    expect(analyzeMediaGroup([] as any).textSection).toBe("Повідомлення не містить даних для аналізу.");
  });
});
