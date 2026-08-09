import { describe, expect, it } from "vitest";
import {
  isLookupablePlate,
  lookupUrl,
  mergeVehicleInfo,
  normalizePlate,
  toVehicleInfo,
} from "./registry";

describe("normalizePlate / isLookupablePlate", () => {
  it("strips formatting", () => {
    expect(normalizePlate("12-345-67")).toBe("1234567");
    expect(normalizePlate(" 123 45 678 ")).toBe("12345678");
  });

  it("accepts 5–8 digit plates, rejects the rest", () => {
    expect(isLookupablePlate("12-345-67")).toBe(true);
    expect(isLookupablePlate("12345")).toBe(true);
    expect(isLookupablePlate("1234")).toBe(false);
    expect(isLookupablePlate("123456789")).toBe(false);
    expect(isLookupablePlate("")).toBe(false);
  });
});

describe("toVehicleInfo", () => {
  // Shape taken from a real data.gov.il response for plate 1234567.
  const record = {
    mispar_rechev: 1234567,
    tozeret_nm: "אלפא רומיאו_אי",
    degem_nm: "939AXB11",
    kinuy_mishari: "ALFA ROMEO 159",
    shnat_yitzur: 2009,
    tzeva_rechev: "שחור",
  };

  it("prefers the commercial name and returns the year as a string", () => {
    expect(toVehicleInfo(record)).toEqual({ description: "ALFA ROMEO 159", year: "2009" });
  });

  it("falls back to manufacturer + model, stripping the import suffix", () => {
    expect(toVehicleInfo({ ...record, kinuy_mishari: "" })).toEqual({
      description: "אלפא רומיאו 939AXB11",
      year: "2009",
    });
  });

  it("omits the year when the registry has none", () => {
    expect(toVehicleInfo({ ...record, shnat_yitzur: null })).toEqual({
      description: "ALFA ROMEO 159",
    });
  });

  it("accepts a string year", () => {
    expect(toVehicleInfo({ ...record, shnat_yitzur: "2009" })?.year).toBe("2009");
  });

  it("returns null when there is no usable name", () => {
    expect(toVehicleInfo({ mispar_rechev: 1234567 })).toBeNull();
    expect(toVehicleInfo(null)).toBeNull();
    expect(toVehicleInfo("nope")).toBeNull();
  });
});

describe("mergeVehicleInfo", () => {
  const found = { description: "ALFA ROMEO 159", year: "2009" };

  it("fills empty fields", () => {
    expect(mergeVehicleInfo({ manufacturer: "", year: "" }, found, null)).toEqual({
      manufacturer: "ALFA ROMEO 159",
      year: "2009",
    });
  });

  it("never overwrites what the claimant typed", () => {
    expect(
      mergeVehicleInfo({ manufacturer: "טויוטה שלי", year: "1998" }, found, null)
    ).toEqual({ manufacturer: "טויוטה שלי", year: "1998" });
  });

  it("replaces values this mechanism filled earlier (corrected plate)", () => {
    const previous = { manufacturer: "GLC 43 AMG", year: "2019" };
    expect(mergeVehicleInfo({ ...previous }, found, previous)).toEqual({
      manufacturer: "ALFA ROMEO 159",
      year: "2009",
    });
  });

  it("keeps the claimant's edit of a previously auto-filled value", () => {
    // Regression: an impure updater re-ran and saw its own write, clobbering this.
    const previous = { manufacturer: "GLC 43 AMG", year: "2019" };
    expect(
      mergeVehicleInfo({ manufacturer: "טויוטה קורולה שלי", year: "2019" }, found, previous)
    ).toEqual({ manufacturer: "טויוטה קורולה שלי", year: "2009" });
  });

  it("leaves the year alone when the registry has none", () => {
    expect(
      mergeVehicleInfo({ manufacturer: "", year: "2015" }, { description: "X" }, null)
    ).toEqual({ manufacturer: "X", year: "2015" });
  });
});

describe("lookupUrl", () => {
  it("builds an exact-match filter on the numeric plate", () => {
    const url = lookupUrl("12-345-67");
    expect(url).toContain(encodeURIComponent(JSON.stringify({ mispar_rechev: 1234567 })));
    expect(url).toContain("limit=1");
  });
});
