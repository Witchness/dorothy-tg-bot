import { describe, expect, it } from "vitest";
import { isUserAllowlisted, runIfAllowlisted } from "../../src/allowlist_gate.js";

describe("runIfAllowlisted", () => {
  it("executes allowed branch when allowlist is empty", () => {
    const allowlist = new Set<string>();
    const result = runIfAllowlisted(allowlist, undefined, () => "allowed");
    expect(result).toBe("allowed");
  });

  it("executes allowed branch when user is listed", () => {
    const allowlist = new Set(["123"]);
    let allowedRuns = 0;
    const result = runIfAllowlisted(allowlist, "123", () => {
      allowedRuns += 1;
      return true;
    }, () => false);
    expect(result).toBe(true);
    expect(allowedRuns).toBe(1);
  });

  it("executes blocked callback when user missing", () => {
    const allowlist = new Set(["123"]);
    let allowedRuns = 0;
    let blockedRuns = 0;
    const result = runIfAllowlisted(allowlist, "999", () => {
      allowedRuns += 1;
      return true;
    }, () => {
      blockedRuns += 1;
      return false;
    });
    expect(result).toBe(false);
    expect(allowedRuns).toBe(0);
    expect(blockedRuns).toBe(1);
  });
});

describe("isUserAllowlisted", () => {
  it("returns true for listed user", () => {
    expect(isUserAllowlisted(new Set(["1"]), "1")).toBe(true);
  });

  it("returns false for unknown user", () => {
    expect(isUserAllowlisted(new Set(["1"]), "2")).toBe(false);
  });

  it("returns false when user id missing", () => {
    expect(isUserAllowlisted(new Set(["1"]), undefined)).toBe(false);
  });
});
