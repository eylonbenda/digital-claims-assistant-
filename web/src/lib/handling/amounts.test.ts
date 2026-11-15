import { describe, expect, it } from "vitest";
import { MAX_AMOUNT, parseAmount, toAmount } from "./amounts";

describe("parseAmount", () => {
  it("clears on empty input", () => {
    for (const raw of ["", "   ", null, undefined]) expect(parseAmount(raw)).toEqual({ ok: true, value: null });
  });

  it("accepts plain numbers, separators, decimals and the shekel sign", () => {
    expect(parseAmount("12500")).toEqual({ ok: true, value: 12500 });
    expect(parseAmount("12,500.50")).toEqual({ ok: true, value: 12500.5 });
    expect(parseAmount("₪ 12 500")).toEqual({ ok: true, value: 12500 });
    expect(parseAmount(8400)).toEqual({ ok: true, value: 8400 });
    expect(parseAmount(0)).toEqual({ ok: true, value: 0 });
  });

  it("rejects text, negatives, three decimals, non-finite and non-string/number input", () => {
    for (const raw of ["abc", "-5", "12.345", "1e5", "12..5", Number.NaN, -1, Infinity, {}, [], true]) {
      expect(parseAmount(raw).ok).toBe(false);
    }
  });

  it("rejects amounts above the cap and accepts the cap itself", () => {
    expect(parseAmount(MAX_AMOUNT)).toEqual({ ok: true, value: MAX_AMOUNT });
    expect(parseAmount(MAX_AMOUNT + 1).ok).toBe(false);
  });
});

describe("toAmount", () => {
  it("reads PostgREST numerics and treats missing values as null", () => {
    expect(toAmount("12500.50")).toBe(12500.5);
    expect(toAmount(300)).toBe(300);
    for (const v of [null, undefined, "", "x"]) expect(toAmount(v)).toBeNull();
  });
});

import { planAmountsUpdate } from "./amounts";

describe("planAmountsUpdate", () => {
  it("updates only the keys that were sent", () => {
    expect(planAmountsUpdate({ demand_amount: "12,000" })).toEqual({ update: { demand_amount: 12000 } });
    expect(planAmountsUpdate({ paid_amount: 5000, demand_amount: "" })).toEqual({
      update: { paid_amount: 5000, demand_amount: null },
    });
  });

  it("clears a field on null", () => {
    expect(planAmountsUpdate({ paid_amount: null })).toEqual({ update: { paid_amount: null } });
  });

  it("names the field in the error", () => {
    expect(planAmountsUpdate({ paid_amount: "abc" })).toEqual({ error: "סכום ששולם: סכום לא תקין" });
  });

  it("refuses a body with neither key, and non-object bodies", () => {
    for (const body of [{}, { other: 1 }, null, "x", 5, []]) {
      expect("error" in planAmountsUpdate(body)).toBe(true);
    }
  });
});
