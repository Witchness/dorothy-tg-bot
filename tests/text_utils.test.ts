import { describe, expect, it } from "vitest";
import { splitForTelegram, toValidUnicode } from "../src/text_utils.js";

describe("toValidUnicode", () => {
  it("replaces dangling high surrogates", () => {
    const input = "\uD83Dhello";
    expect(toValidUnicode(input)).toBe("�hello");
  });

  it("replaces dangling low surrogates", () => {
    const input = "world\uDC36";
    expect(toValidUnicode(input)).toBe("world�");
  });

  it("keeps valid surrogate pairs intact", () => {
    const input = "Test" + String.fromCodePoint(0x1f984);
    expect(toValidUnicode(input)).toBe(input);
  });
});

describe("splitForTelegram", () => {
  it("splits by code points to avoid breaking surrogate pairs", () => {
    const unicorn = String.fromCodePoint(0x1f984);
    const text = `A${unicorn}B${unicorn}`;
    const chunks = splitForTelegram(text, 2);
    expect(chunks).toEqual([`A${unicorn}`, `B${unicorn}`]);
  });

  it("returns original message when shorter than limit", () => {
    const text = "short";
    expect(splitForTelegram(text, 100)).toEqual([text]);
  });
});
