import { describe, expect, it } from "vitest";
import { visualRuns } from "./bidi";

const texts = (s: string) => visualRuns(s).map((r) => r.text);

describe("visualRuns", () => {
  it("leaves strings without RTL letters as one LTR run", () => {
    expect(visualRuns("054-1234567")).toEqual([{ text: "054-1234567", rtl: false }]);
    expect(visualRuns("dana@example.com")).toEqual([{ text: "dana@example.com", rtl: false }]);
  });

  it("leaves pure Hebrew as one run for fontkit to reverse", () => {
    expect(visualRuns("דנה כהן")).toEqual([{ text: "דנה כהן", rtl: true }]);
  });

  it("keeps a multi-digit number inside Hebrew in LTR order", () => {
    expect(texts("כביש 75")).toEqual(["75", "כביש "]);
    expect(texts("רחוב הרצל 123 חיפה")).toEqual([" חיפה", "123", "רחוב הרצל "]);
  });

  it("joins digits across a single separator", () => {
    expect(texts("דירה 4/12")).toEqual(["4/12", "דירה "]);
    expect(texts("טלפון 054-1234567")).toEqual(["054-1234567", "טלפון "]);
  });

  it("keeps Latin words in order and attaches a following number to them", () => {
    expect(texts("טויוטה Corolla 2019")).toEqual(["Corolla 2019", "טויוטה "]);
  });

  it("mirrors a lone bracket that ends up in an RTL run", () => {
    expect(texts("רכב (Toyota)")).toEqual(["(", "Toyota", "רכב ("]);
  });

  it("treats Arabic as RTL", () => {
    expect(texts("شارع 12")).toEqual(["12", "شارع "]);
  });
});
