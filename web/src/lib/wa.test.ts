import { describe, expect, it } from "vitest";
import { waPhone } from "./wa";

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
