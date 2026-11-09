import { describe, it, expect } from "vitest";
import {
  TP_INSURER_NONE,
  TP_INSURER_UNKNOWN,
  isNamedTpInsurer,
  licenceHolderName,
  toClaimData,
  type State,
} from "./claim-state";

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

  it("omits driver when the car was parked (nobody drove)", () => {
    const d = toClaimData({ ...base, driver: { ...base.driver, parked: true } });
    expect(d.driver).toBeUndefined();
  });
});

describe("licenceHolderName", () => {
  it("names the policyholder when they drove", () => {
    expect(licenceHolderName({ ...base, driver: { ...base.driver, isInsured: true } })).toBe("דנה לוי");
  });

  it("names the other driver when someone else drove", () => {
    const s = { ...base, driver: { ...base.driver, isInsured: false, first_name: "רון", last_name: "כהן" } };
    expect(licenceHolderName(s)).toBe("רון כהן");
  });

  it("is empty when the other driver's name hasn't been entered", () => {
    expect(licenceHolderName({ ...base, driver: { ...base.driver, isInsured: false } })).toBe("");
  });

  it("is empty when the driver question is unanswered", () => {
    expect(licenceHolderName(base)).toBe("");
  });

  it("is empty for a parked car, even with a stale driver answer", () => {
    const s = { ...base, driver: { ...base.driver, isInsured: true, parked: true } };
    expect(licenceHolderName(s)).toBe("");
  });

  it("trims and skips a missing name part", () => {
    const s = { ...base, driver: { ...base.driver, isInsured: false, first_name: " רון ", last_name: "" } };
    expect(licenceHolderName(s)).toBe("רון");
  });
});

describe("toClaimData — third party", () => {
  it("keeps the partial third-party block on details_unknown (hit-and-run)", () => {
    const d = toClaimData({
      ...base,
      thirdParty: { present: true, details_unknown: true, name: "", phone: "", plate: "1234567", insurer: "" },
    });
    expect(d.third_parties).toEqual([
      { owner_name: "", driver_name: "", phone: "", vehicle_plate: "1234567", insurer: "" },
    ]);
  });

  it("maps every reported vehicle in order (multi-car accident)", () => {
    const d = toClaimData({
      ...base,
      thirdParty: { present: true, name: "רון", phone: "0501111111", plate: "1111111", insurer: "כלל" },
      extraThirdParties: [{ name: "גל", phone: "", plate: "2222222", insurer: "הראל" }],
    });
    expect(d.third_parties?.map((tp) => tp.vehicle_plate)).toEqual(["1111111", "2222222"]);
    expect(d.third_parties?.[1]).toEqual({
      owner_name: "גל", driver_name: "גל", phone: "", vehicle_plate: "2222222", insurer: "הראל",
    });
  });

  it("drops stale extra vehicles when the claimant then answered no third party", () => {
    const d = toClaimData({
      ...base,
      thirdParty: { present: false, name: "", phone: "", plate: "", insurer: "" },
      extraThirdParties: [{ name: "גל", phone: "", plate: "2222222", insurer: "הראל" }],
    });
    expect(d.third_parties).toBeUndefined();
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

describe("toClaimData — insurance type", () => {
  it("includes a concrete insurance_type", () => {
    expect(toClaimData(base).insurance_type).toBe("comprehensive");
  });

  it('omits insurance_type for "" and for the "unknown" sentinel', () => {
    expect(toClaimData({ ...base, insuranceType: "" }).insurance_type).toBeUndefined();
    expect(toClaimData({ ...base, insuranceType: "unknown" }).insurance_type).toBeUndefined();
  });
});

describe("toClaimData — accident place", () => {
  it("joins street + city into the single location cell", () => {
    const d = toClaimData({ ...base, accident: { ...base.accident, street: "דרך אחוזה", city: "רעננה" } });
    expect(d.accident?.location).toBe("דרך אחוזה, רעננה");
  });

  it("accepts either part alone, and neither", () => {
    expect(toClaimData({ ...base, accident: { ...base.accident, location: "", city: "חיפה" } }).accident?.location).toBe("חיפה");
    expect(toClaimData({ ...base, accident: { ...base.accident, location: "", street: "", city: "" } }).accident?.location).toBe("");
  });

  it("keeps a pre-split free-text location as the street", () => {
    expect(toClaimData(base).accident?.location).toBe("צומת");
    expect(toClaimData({ ...base, accident: { ...base.accident, city: "חיפה" } }).accident?.location).toBe("צומת, חיפה");
  });
});

describe("toClaimData — damage focus", () => {
  it("fills damage.insured_vehicle and appends it to the description", () => {
    const d = toClaimData({ ...base, damage: { areas: ["right", "front"], hasMore: true, moreAreas: ["rear"] } });
    expect(d.damage?.insured_vehicle).toBe("מוקד נזק: קדמי + צד ימין; מוקד נזק נוסף: אחורי");
    expect(d.accident?.description).toBe("פגיעה מאחור | מוקד נזק: קדמי + צד ימין; מוקד נזק נוסף: אחורי");
  });

  it("ignores stale extra areas once the follow-up is answered no", () => {
    const d = toClaimData({ ...base, damage: { areas: ["left"], hasMore: false, moreAreas: ["rear"] } });
    expect(d.damage?.insured_vehicle).toBe("מוקד נזק: צד שמאל");
  });

  it('records "not sure" as an unknown focus', () => {
    const d = toClaimData({ ...base, damage: { areas: [], unsure: true, hasMore: null, moreAreas: [] } });
    expect(d.damage?.insured_vehicle).toBe("מוקד נזק: לא ידוע");
  });

  it("leaves damage and the description untouched when unanswered (older claims)", () => {
    const d = toClaimData(base);
    expect(d.damage).toBeUndefined();
    expect(d.accident?.description).toBe("פגיעה מאחור");
  });
});

describe("isNamedTpInsurer", () => {
  it("rejects the unknown / uninsured sentinels and blanks", () => {
    expect(isNamedTpInsurer("הראל")).toBe(true);
    expect(isNamedTpInsurer(TP_INSURER_UNKNOWN)).toBe(false);
    expect(isNamedTpInsurer(TP_INSURER_NONE)).toBe(false);
    expect(isNamedTpInsurer(" ")).toBe(false);
    expect(isNamedTpInsurer(null)).toBe(false);
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
