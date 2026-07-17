import { describe, it, expect } from "vitest";
import { toClaimData, type State } from "./claim-state";

const base: State = {
  consent: true,
  injuries: false,
  policyInsurer: "menora",
  insuranceType: "comprehensive",
  insured: { first_name: "דנה", last_name: "לוי", id_number: "312345678", mobile: "0501234567", city: "חיפה" },
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "12-345-67", manufacturer: "טויוטה קורולה", year: "2020" },
  accident: { date: "2026-07-10", time: "08:30", location: "צומת", description: "פגיעה מאחור" },
  fault: "third_party",
  thirdParty: { present: false, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
  documents: [],
};

describe("toClaimData — driver", () => {
  it("copies the insured into driver when the insured was driving", () => {
    const d = toClaimData({ ...base, driver: { ...base.driver, isInsured: true } });
    expect(d.driver).toEqual({
      first_name: "דנה",
      last_name: "לוי",
      id_number: "312345678",
      relation_to_insured: "המבוטח",
    });
  });

  it("uses the other driver's details when the insured was not driving", () => {
    const d = toClaimData({
      ...base,
      driver: { isInsured: false, first_name: "רון", last_name: "כהן", id_number: "98765432", license_number: "5566778", relation_to_insured: "אח" },
    });
    expect(d.driver).toEqual({
      first_name: "רון",
      last_name: "כהן",
      id_number: "98765432",
      license_number: "5566778",
      relation_to_insured: "אח",
    });
  });

  it("omits driver entirely when the driver question was not answered", () => {
    expect(toClaimData(base).driver).toBeUndefined();
  });
});

describe("toClaimData — declaration", () => {
  it("fills signatory + DD/MM/YYYY date + data_consent, no poa when no third party", () => {
    const d = toClaimData({ ...base, declaration: { data_consent: true, poa_third_party: true, signed_date: "2026-07-14" } });
    expect(d.declarations).toEqual({
      signatory_name: "דנה לוי",
      date: "14/07/2026",
      data_consent: true,
    });
  });

  it("includes poa_third_party only when a third party is present", () => {
    const d = toClaimData({
      ...base,
      thirdParty: { present: true, name: "רון", phone: "", plate: "1-2-3", insurer: "כלל" },
      declaration: { data_consent: true, poa_third_party: true, signed_date: "2026-07-14" },
    });
    expect(d.declarations?.poa_third_party).toBe(true);
  });
});

describe("toClaimData — backward compatibility", () => {
  it("does not throw on legacy state lacking driver/declaration blocks", () => {
    const legacy = { ...base } as Partial<State>;
    delete (legacy as Record<string, unknown>).driver;
    delete (legacy as Record<string, unknown>).declaration;
    expect(() => toClaimData(legacy as State)).not.toThrow();
    expect(toClaimData(legacy as State).driver).toBeUndefined();
  });
});
