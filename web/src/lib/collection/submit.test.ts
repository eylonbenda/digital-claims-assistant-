import { describe, expect, it } from "vitest";
import { ALREADY_SUBMITTED, isAlreadySubmitted, parseSubmitBody } from "./submit";

describe("parseSubmitBody", () => {
  it("accepts a token + collected object", () => {
    expect(parseSubmitBody({ token: "t", collected: { a: 1 } })).toEqual({
      token: "t",
      collected: { a: 1 },
    });
  });

  it.each([
    null,
    "x",
    {},
    { token: "" , collected: {} },
    { token: 1, collected: {} },
    { token: "t" },
    { token: "t", collected: null },
    { token: "t", collected: "x" },
    { token: "t", collected: [] },
  ])("rejects %j", (body) => {
    expect(parseSubmitBody(body)).toBeNull();
  });
});

describe("isAlreadySubmitted", () => {
  it("is true only for a 409 carrying the code", () => {
    expect(isAlreadySubmitted(409, { code: ALREADY_SUBMITTED })).toBe(true);
    expect(isAlreadySubmitted(409, { error: "claim is closed" })).toBe(false);
    expect(isAlreadySubmitted(200, { code: ALREADY_SUBMITTED })).toBe(false);
    expect(isAlreadySubmitted(409, null)).toBe(false);
  });
});
