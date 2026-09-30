import { describe, expect, it } from "vitest";
import { errorMessage, shouldAlert } from "./report";

describe("errorMessage", () => {
  it("reads Error, error-like objects and primitives", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "pg says no" })).toBe("pg says no");
    expect(errorMessage("plain")).toBe("plain");
  });

  it("truncates long messages", () => {
    expect(errorMessage("x".repeat(500))).toHaveLength(301);
  });
});

describe("shouldAlert", () => {
  const prod = { ALERT_WEBHOOK_URL: "https://hook", VERCEL_ENV: "production" };

  it("only alerts in production with a webhook configured", () => {
    expect(shouldAlert("a", 0, { VERCEL_ENV: "production" })).toBe(false);
    expect(shouldAlert("a", 0, { ...prod, VERCEL_ENV: "preview" })).toBe(false);
  });

  it("throttles repeats of the same location", () => {
    expect(shouldAlert("route-x", 1_000, prod)).toBe(true);
    expect(shouldAlert("route-x", 60_000, prod)).toBe(false);
    expect(shouldAlert("route-y", 60_000, prod)).toBe(true);
    expect(shouldAlert("route-x", 1_000 + 5 * 60_000, prod)).toBe(true);
  });
});
