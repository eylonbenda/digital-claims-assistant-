import { describe, it, expect } from "vitest";
import { formFacts } from "./kinds";

describe("formFacts", () => {
  it("a demand form alone is not an accident notice", () => {
    expect(formFacts(["demand_form"])).toEqual({ hasAccidentNotice: false, generatedDocTypes: ["demand_form"] });
  });
  it("an accident notice alone", () => {
    expect(formFacts(["accident_notice"])).toEqual({ hasAccidentNotice: true, generatedDocTypes: [] });
  });
  it("no forms", () => {
    expect(formFacts([])).toEqual({ hasAccidentNotice: false, generatedDocTypes: [] });
  });
  it("both, duplicates collapse", () => {
    expect(formFacts(["accident_notice", "demand_form", "demand_form"])).toEqual({
      hasAccidentNotice: true,
      generatedDocTypes: ["demand_form"],
    });
  });
});
