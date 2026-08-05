import { describe, expect, it } from "vitest";
import { isValidIsraeliId, isPlausiblePlate } from "./il";

describe("isValidIsraeliId", () => {
  it("accepts a valid 9-digit ID", () => {
    expect(isValidIsraeliId("123456782")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidIsraeliId("123456780")).toBe(false);
    expect(isValidIsraeliId("123456789")).toBe(false);
  });

  it("pads short IDs before checking", () => {
    // 023456787: same as its 8-digit form "23456787"
    expect(isValidIsraeliId("023456787")).toBe(isValidIsraeliId("23456787"));
  });

  it("ignores formatting characters", () => {
    expect(isValidIsraeliId("12345678-2")).toBe(true);
  });

  it("rejects empty / too short / too long", () => {
    expect(isValidIsraeliId("")).toBe(false);
    expect(isValidIsraeliId("123")).toBe(false);
    expect(isValidIsraeliId("1234567890")).toBe(false);
  });
});

describe("isPlausiblePlate", () => {
  it("accepts 7- and 8-digit plates with or without dashes", () => {
    expect(isPlausiblePlate("12-345-67")).toBe(true);
    expect(isPlausiblePlate("123-45-678")).toBe(true);
    expect(isPlausiblePlate("1234567")).toBe(true);
  });

  it("accepts old short plates", () => {
    expect(isPlausiblePlate("12345")).toBe(true);
  });

  it("rejects letters, too few or too many digits", () => {
    expect(isPlausiblePlate("AB-123")).toBe(false);
    expect(isPlausiblePlate("1234")).toBe(false);
    expect(isPlausiblePlate("123456789")).toBe(false);
  });
});
