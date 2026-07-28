import { describe, expect, it } from "vitest";
import { waPhone, chaseMessage, chaseHref } from "./wa";

describe("waPhone", () => {
  it("converts local mobile to international", () => {
    expect(waPhone("0521234567")).toBe("972521234567");
  });
  it("strips formatting characters", () => {
    expect(waPhone("052-123 4567")).toBe("972521234567");
  });
  it("passes through numbers already in international form", () => {
    expect(waPhone("972521234567")).toBe("972521234567");
  });
  it("returns null for garbage", () => {
    expect(waPhone("abc")).toBeNull();
    expect(waPhone("03")).toBeNull();
  });
});

describe("chaseMessage", () => {
  it("itemizes blocking docs when items are given", () => {
    const msg = chaseMessage({
      firstName: "דנה",
      items: ["רישיון נהיגה", "תמונות נזק"],
      uploadUrl: "https://app.example/c/tok1",
    });
    expect(msg).toContain("שלום דנה");
    expect(msg).toContain("• רישיון נהיגה");
    expect(msg).toContain("• תמונות נזק");
    expect(msg).toContain("https://app.example/c/tok1");
  });

  it("falls back to a generic line without items", () => {
    const msg = chaseMessage({ uploadUrl: "https://app.example/c/tok1" });
    expect(msg).toContain("שלום,");
    expect(msg).toContain("עדיין חסרים לנו מסמכים");
    expect(msg).not.toContain("•");
  });
});

describe("chaseHref", () => {
  it("builds a wa.me link for a valid Israeli mobile", () => {
    const href = chaseHref("052-1234567", { uploadUrl: "https://x/c/t" });
    expect(href).toMatch(/^https:\/\/wa\.me\/972521234567\?text=/);
  });

  it("returns null when the phone is unusable", () => {
    expect(chaseHref(null, { uploadUrl: "https://x/c/t" })).toBeNull();
    expect(chaseHref("123", { uploadUrl: "https://x/c/t" })).toBeNull();
  });
});
