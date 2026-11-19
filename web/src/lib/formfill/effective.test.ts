import { describe, it, expect } from "vitest";
import { effectiveClaimData, garageNameDefault, type ClaimSummaryJson } from "./effective";
import type { State } from "@/lib/collection/claim-state";

const collected: State = {
  consent: true,
  injuries: false,
  policyInsurer: "migdal",
  insuranceType: "comprehensive",
  insured: { first_name: "דנה", last_name: "לוי", id_number: "312345678", mobile: "0501234567", city: "חיפה" },
  driver: { isInsured: true, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "12-345-67", manufacturer: "טויוטה", year: "2020" },
  accident: { date: "2026-07-10", time: "08:30", location: "צומת", description: "פגיעה מאחור" },
  fault: "third_party",
  thirdParty: { present: false, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
  documents: [],
};

describe("garageNameDefault", () => {
  it("is the business name only for a garage", () => {
    expect(garageNameDefault({ name: " מוסך רעננה ", kind: "garage" })).toBe("מוסך רעננה");
    expect(garageNameDefault({ name: "סוכנות כהן", kind: "agent" })).toBeNull();
    expect(garageNameDefault({ name: "לא ידוע", kind: null })).toBeNull();
    expect(garageNameDefault({ name: "  ", kind: "garage" })).toBeNull();
    expect(garageNameDefault(null)).toBeNull();
  });
});

describe("effectiveClaimData garage default", () => {
  it("pre-fills garage.name on data derived from the submission", () => {
    const d = effectiveClaimData({ collected }, { garageName: "מוסך רעננה" });
    expect(d?.garage?.name).toBe("מוסך רעננה");
    expect(d?.insured?.first_name).toBe("דנה");
  });

  it("leaves derived data alone without a default", () => {
    expect(effectiveClaimData({ collected })?.garage?.name).toBeUndefined();
  });

  it("never overrides the agent's saved form_data — including a cleared name", () => {
    const summary: ClaimSummaryJson = { collected, form_data: { garage: { phone: "09-7654321" } } };
    const d = effectiveClaimData(summary, { garageName: "מוסך רעננה" });
    expect(d?.garage).toEqual({ phone: "09-7654321" });
  });

  it("returns null with nothing collected", () => {
    expect(effectiveClaimData(null, { garageName: "מוסך רעננה" })).toBeNull();
  });
});
