import { describe, expect, it } from "vitest";
import { followupFields } from "./followup-fields";

const types = (claimType: string | null, policyActivated = false) =>
  followupFields(claimType, policyActivated).map((f) => f.type);

describe("followupFields", () => {
  it("always offers the base documents", () => {
    expect(types("own_policy")).toEqual(["car_photo", "drivers_license", "vehicle_reg", "third_party_doc"]);
    expect(types(null)).toEqual(["car_photo", "drivers_license", "vehicle_reg", "third_party_doc"]);
  });

  it("offers אישור אי-הגשה and עבר ביטוחי on third_party_report", () => {
    expect(types("third_party_report")).toEqual(expect.arrayContaining(["no_claim_confirmation", "insurance_history"]));
  });

  it("hides אישור אי-הגשה once the client's own policy was activated", () => {
    const fields = types("third_party_report", true);
    expect(fields).not.toContain("no_claim_confirmation");
    expect(fields).toContain("insurance_history");
  });

  it("offers only אישור אי-הגשה on the settlement track, which requires it too", () => {
    const fields = types("third_party_settlement");
    expect(fields).toContain("no_claim_confirmation");
    expect(fields).not.toContain("insurance_history");
  });
});
