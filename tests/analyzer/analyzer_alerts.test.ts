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

describe("analyzer alerts (payload)", () => {
  it("emits alerts for new payload keys in arrays and nested objects", async () => {
    recordPayloadKeys.mockImplementation((label: string, keys: string[]) => keys);

    const { analyzeMessage } = await import("../../src/analyzer.js");
    const summary = analyzeMessage({
      text: "x",
      entities: [],
      paid_media: [{ a: 1 }, { b: 2 }],
      reply_to_message: { text: "prev", meta: { inner: true } },
    } as any);

    const alerts = summary.alerts?.join("\n") ?? "";
    expect(alerts).toContain("message.paid_media");
    expect(alerts).toContain("message.reply_to_message");
  });

  it("emits shape-detected when keys didn't change", async () => {
    // First storeUnhandledSample call is for the whole message → return null (no alert)
    storeUnhandledSample.mockReturnValueOnce(null);
    // Second call is for link_preview_options → return a snapshot to trigger 'shape detected'
    storeUnhandledSample.mockReturnValueOnce({ signature: "sig-x" });

    const { analyzeMessage } = await import("../../src/analyzer.js");
    const summary = analyzeMessage({ text: "x", link_preview_options: { is_disabled: true } } as any);
    const alerts = summary.alerts?.join("\n") ?? "";
    expect(alerts).toContain("message.link_preview_options");
    expect(alerts).toContain("shape detected");
  });
});