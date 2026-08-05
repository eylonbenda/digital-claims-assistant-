import { describe, expect, it } from "vitest";
import { addressLabel, formatCoords } from "./reverse";

describe("formatCoords", () => {
  it("renders 5-decimal coordinates with the נ\"צ prefix", () => {
    expect(formatCoords(32.794046, 34.989571)).toBe('נ"צ 32.79405, 34.98957');
  });
});

describe("addressLabel", () => {
  it("joins street + number + city", () => {
    expect(
      addressLabel({ address: { road: "דרך העצמאות", house_number: "12", city: "חיפה" } })
    ).toBe("דרך העצמאות 12, חיפה");
  });

  it("falls back through town/village/suburb for the locality", () => {
    expect(addressLabel({ address: { road: "הראשי", town: "עתלית" } })).toBe("הראשי, עתלית");
    expect(addressLabel({ address: { village: "בית אורן" } })).toBe("בית אורן");
  });

  it("handles street-only and city-only responses", () => {
    expect(addressLabel({ address: { road: "כביש 4" } })).toBe("כביש 4");
    expect(addressLabel({ address: { city: "חיפה" } })).toBe("חיפה");
  });

  it("returns null for empty or malformed responses", () => {
    expect(addressLabel({ address: {} })).toBeNull();
    expect(addressLabel({})).toBeNull();
    expect(addressLabel(null)).toBeNull();
    expect(addressLabel("nope")).toBeNull();
  });
});
