import { describe, expect, it } from "vitest";
import { foldOverflowThirdParties, thirdPartySlots } from "./overflow";
import { templates } from "./index";
import type { ClaimData } from "./types";

const three: ClaimData = {
  accident: { description: "נסעתי ישר ונפגעתי" },
  third_parties: [
    { vehicle_plate: "1111111", owner_name: "רון", insurer: "כלל" },
    { vehicle_plate: "2222222", owner_name: "גל", insurer: "הראל" },
    { vehicle_plate: "3333333", driver_name: "נועה" },
  ],
};

describe("thirdPartySlots", () => {
  it("counts rows from the highest third_parties.N index", () => {
    expect(thirdPartySlots(["insured.first_name", "third_parties.0.phone", "third_parties.2.insurer"])).toBe(3);
    expect(thirdPartySlots(["third_parties.0.vehicle_plate"])).toBe(1);
    expect(thirdPartySlots(["accident.description"])).toBe(0);
  });

  it("matches the multi-vehicle forms (pilot 2026-10-31)", () => {
    const slots = (name: string) => {
      const t = Object.values(templates).find((x) => x.insurer === name)!;
      return thirdPartySlots(t.fields.map((f) => f.key));
    };
    expect(slots("הכשרה")).toBe(3);
    expect(slots("מנורה")).toBe(3);
    expect(slots("הראל")).toBe(1);
  });
});

describe("foldOverflowThirdParties", () => {
  it("leaves data untouched when every vehicle has a row", () => {
    expect(foldOverflowThirdParties(three, 3)).toBe(three);
  });

  it("appends vehicles past the last row to the accident description", () => {
    const out = foldOverflowThirdParties(three, 1);
    expect(out.accident?.description).toBe(
      "נסעתי ישר ונפגעתי | מעורב נוסף: 2222222, גל, הראל | מעורב נוסף: 3333333, נועה",
    );
    expect(three.accident?.description).toBe("נסעתי ישר ונפגעתי"); // input not mutated
  });

  it("skips a vehicle with nothing to say and works without a description", () => {
    const out = foldOverflowThirdParties({ third_parties: [{}, {}, { vehicle_plate: "3333333" }] }, 1);
    expect(out.accident?.description).toBe("מעורב נוסף: 3333333");
  });
});
