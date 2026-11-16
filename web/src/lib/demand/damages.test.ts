import { describe, expect, it } from "vitest";
import {
  VAT_RATE,
  DEFAULT_VAT,
  computeDamageTotals,
  formatLetterAmount,
  parseAmountInput,
  validateDamages,
} from "./damages";

describe("computeDamageTotals", () => {
  it("pins the VAT rate and defaults", () => {
    expect(VAT_RATE).toBe(0.18);
    expect(DEFAULT_VAT).toEqual({ repair: true, diminished_value: false, assessor_fee: true, towing: true });
  });

  it("spec acceptance, VAT on", () => {
    const t = computeDamageTotals({
      repair: { amount: 7370, vat: true },
      assessor_fee: { amount: 677.97, vat: true },
    });
    expect(t?.rows.map((r) => r.amount)).toEqual([7370, 677.97]);
    expect(t?.vat).toBe(1448.63);
    expect(t?.total).toBe(9496.6);
  });

  it("claimant VAT registered: no VAT", () => {
    const t = computeDamageTotals({
      repair: { amount: 7370, vat: true },
      assessor_fee: { amount: 677.97, vat: true },
      claimant_vat_registered: true,
    });
    expect(t?.vat).toBeNull();
    expect(t?.total).toBe(8047.97);
  });

  it("diminished value adds no VAT", () => {
    const t = computeDamageTotals({ repair: { amount: 1000, vat: true }, diminished_value: { amount: 500, vat: false } });
    expect(t?.vat).toBe(180);
    expect(t?.total).toBe(1680);
  });

  it("agorot exactness", () => {
    const a = computeDamageTotals({ other: [{ label: "a", amount: 0.1 }, { label: "b", amount: 0.2 }] });
    expect(a?.total).toBe(0.3);
    const b = computeDamageTotals({ other: [{ label: "a", amount: 0.25, vat: true }] });
    expect(b?.vat).toBe(0.05);
  });

  it("row order and labels", () => {
    const t = computeDamageTotals({
      towing: { amount: 1, vat: false },
      repair: { amount: 2, vat: false },
      other: [{ label: "x", amount: 3 }],
    });
    expect(t?.rows).toEqual([
      { key: "repair", label: "", amount: 2 },
      { key: "towing", label: "", amount: 1 },
      { key: "other", label: "x", amount: 3 },
    ]);
  });

  it("other without vat gets none", () => {
    expect(computeDamageTotals({ other: [{ label: "x", amount: 100 }] })?.vat).toBe(0);
  });

  it.each([
    undefined,
    null,
    {},
    { repair: { amount: 0, vat: true } },
    { repair: { amount: "7370" } },
    { repair: { amount: NaN, vat: true } },
    { other: "x" },
  ])("null for empty/malformed %#", (input) => {
    expect(computeDamageTotals(input as never)).toBeNull();
  });
});

describe("formatLetterAmount", () => {
  it("formats by hand", () => {
    expect(formatLetterAmount(7370)).toBe("7,370.00 ₪");
    expect(formatLetterAmount(0.3)).toBe("0.30 ₪");
    expect(formatLetterAmount(1000000)).toBe("1,000,000.00 ₪");
  });
});

describe("parseAmountInput", () => {
  it("accepts", () => {
    expect(parseAmountInput("7,370")).toEqual({ ok: true, value: 7370 });
    expect(parseAmountInput(" 800 ")).toEqual({ ok: true, value: 800 });
    expect(parseAmountInput("₪800")).toEqual({ ok: true, value: 800 });
    expect(parseAmountInput("7370.5")).toEqual({ ok: true, value: 7370.5 });
    expect(parseAmountInput("")).toEqual({ ok: true, value: null });
  });
  it.each(["abc", "1.234", "-5", "1000001"])("rejects %s", (s) => {
    expect(parseAmountInput(s).ok).toBe(false);
  });
});

describe("validateDamages", () => {
  const ok = { repair: { amount: 7370, vat: true }, assessor_fee: { amount: 677.97, vat: true } };
  it("accepts undefined and the acceptance example", () => {
    expect(validateDamages(undefined)).toEqual({ ok: true });
    expect(validateDamages(ok)).toEqual({ ok: true });
  });
  const bad: [string, unknown][] = [
    ["negative", { repair: { amount: -1, vat: true } }],
    ["NaN", { repair: { amount: NaN, vat: true } }],
    ["3 decimals", { repair: { amount: 12.345, vat: true } }],
    ["too big", { repair: { amount: 1000001, vat: true } }],
    ["other with zero amount", { other: [{ label: "חניה", amount: 0 }] }],
    ["empty label", { other: [{ label: "  ", amount: 1 }] }],
    ["long label", { other: [{ label: "x".repeat(61), amount: 1 }] }],
    ["11 others", { other: Array.from({ length: 11 }, () => ({ label: "x", amount: 1 })) }],
    ["vat string", { repair: { amount: 1, vat: "yes" } }],
    ["registered string", { claimant_vat_registered: "no" }],
    ["array", []],
  ];
  it("uses Hebrew labels, not keys, in errors", () => {
    expect(validateDamages({ repair: { amount: -1, vat: true } })).toEqual({ ok: false, error: "תיקון הרכב: סכום לא תקין" });
    expect(validateDamages({ other: [{ label: "חניה", amount: 0 }] })).toEqual({ ok: false, error: "חניה: חסר סכום" });
  });
  it.each(bad)("rejects %s", (_n, v) => {
    const r = validateDamages(v);
    expect(r.ok).toBe(false);
  });
});
