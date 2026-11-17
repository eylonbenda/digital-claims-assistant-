import { describe, it, expect } from "vitest";
import { formFacts, isRepairPriced } from "./kinds";
import type { ClaimData } from "@/lib/formfill/types";

const withRepair = (amount: unknown) => ({ damages: { repair: { amount } } }) as unknown as ClaimData;

describe("formFacts", () => {
  it("a demand form alone, repair unpriced, does not count", () => {
    expect(formFacts(["demand_form"], false)).toEqual({ hasAccidentNotice: false, generatedDocTypes: [] });
  });
  it("a demand form counts once the repair is priced", () => {
    expect(formFacts(["demand_form"], true)).toEqual({ hasAccidentNotice: false, generatedDocTypes: ["demand_form"] });
  });
  it("an accident notice alone", () => {
    expect(formFacts(["accident_notice"], true)).toEqual({ hasAccidentNotice: true, generatedDocTypes: [] });
  });
  it("no forms", () => {
    expect(formFacts([], true)).toEqual({ hasAccidentNotice: false, generatedDocTypes: [] });
  });
  it("both, duplicates collapse", () => {
    expect(formFacts(["accident_notice", "demand_form", "demand_form"], true)).toEqual({
      hasAccidentNotice: true,
      generatedDocTypes: ["demand_form"],
    });
  });
});

describe("isRepairPriced", () => {
  it("null -> false", () => expect(isRepairPriced(null)).toBe(false));
  it("{} -> false", () => expect(isRepairPriced({} as ClaimData)).toBe(false));
  it("amount 0 -> false", () => expect(isRepairPriced(withRepair(0))).toBe(false));
  it("string amount -> false", () => expect(isRepairPriced(withRepair("7370"))).toBe(false));
  it("NaN -> false", () => expect(isRepairPriced(withRepair(NaN))).toBe(false));
  it("7370 -> true", () => expect(isRepairPriced(withRepair(7370))).toBe(true));
});
