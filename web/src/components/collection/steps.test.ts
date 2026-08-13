import { describe, expect, it } from "vitest";
import { STEPS, firstIncompleteKey, isStepKey, visibleSteps } from "./steps";
import type { State } from "@/lib/collection/claim-state";

const BASE: State = {
  consent: false,
  injuries: null,
  policyInsurer: "",
  insuranceType: "",
  insured: { first_name: "", last_name: "", id_number: "", mobile: "", city: "" },
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "", manufacturer: "", year: "" },
  accident: { date: "", time: "", location: "", description: "" },
  fault: null,
  thirdParty: { present: null, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
  documents: [],
};

describe("step registry", () => {
  it("orders tap chapter before typing chapter", () => {
    const keys = STEPS.map((s) => s.key);
    expect(keys).toEqual([
      "intro", "injuries", "driver_who", "fault", "tp_present",
      "vehicle", "insured", "driver_details", "tp_details",
      "when_where", "description", "documents", "summary",
    ]);
  });

  it("skips driver_details when the insured drove, keeps it otherwise", () => {
    const insuredDrove: State = { ...BASE, driver: { ...BASE.driver, isInsured: true } };
    expect(visibleSteps(insuredDrove).map((s) => s.key)).not.toContain("driver_details");
    const otherDrove: State = { ...BASE, driver: { ...BASE.driver, isInsured: false } };
    expect(visibleSteps(otherDrove).map((s) => s.key)).toContain("driver_details");
  });

  it("skips tp_details when no third party", () => {
    const noTp: State = { ...BASE, thirdParty: { ...BASE.thirdParty, present: false } };
    expect(visibleSteps(noTp).map((s) => s.key)).not.toContain("tp_details");
  });

  it("firstIncompleteKey walks the visible order", () => {
    expect(firstIncompleteKey(BASE)).toBe("intro");
    const consented: State = { ...BASE, consent: true };
    expect(firstIncompleteKey(consented)).toBe("injuries");
    const quickDone: State = {
      ...consented,
      injuries: false,
      fault: "third_party",
      driver: { ...BASE.driver, isInsured: true },
      thirdParty: { ...BASE.thirdParty, present: false },
    };
    expect(firstIncompleteKey(quickDone)).toBe("vehicle");
  });

  it("falls back to summary when everything is complete", () => {
    const full: State = {
      ...BASE,
      consent: true,
      injuries: false,
      fault: "me",
      policyInsurer: "harel",
      insuranceType: "comprehensive",
      insured: { first_name: "א", last_name: "ב", id_number: "1", mobile: "05", city: "ת״א" },
      driver: { ...BASE.driver, isInsured: true },
      vehicle: { plate: "1234567", manufacturer: "טויוטה", year: "2020" },
      accident: { date: "2026-08-01", time: "10:00", location: "איילון", description: "פגיעה מאחור" },
      thirdParty: { ...BASE.thirdParty, present: false },
    };
    expect(firstIncompleteKey(full)).toBe("summary");
  });

  it("driver_details.isComplete requires first/last/id, not just some", () => {
    const step = STEPS.find((s) => s.key === "driver_details")!;
    const missingFirstName: State = {
      ...BASE,
      driver: { ...BASE.driver, isInsured: false, first_name: "", last_name: "כהן", id_number: "123456789" },
    };
    expect(step.isComplete(missingFirstName)).toBe(false);
    const filled: State = {
      ...BASE,
      driver: { ...BASE.driver, isInsured: false, first_name: "דני", last_name: "כהן", id_number: "123456789" },
    };
    expect(step.isComplete(filled)).toBe(true);
  });

  it("tp_details.isComplete requires name/plate/insurer, not just some", () => {
    const step = STEPS.find((s) => s.key === "tp_details")!;
    const missingName: State = {
      ...BASE,
      thirdParty: { ...BASE.thirdParty, present: true, name: "", plate: "1234567", insurer: "הראל" },
    };
    expect(step.isComplete(missingName)).toBe(false);
    const filled: State = {
      ...BASE,
      thirdParty: { ...BASE.thirdParty, present: true, name: "יוסי לוי", plate: "1234567", insurer: "הראל" },
    };
    expect(step.isComplete(filled)).toBe(true);
  });

  it("isStepKey guards strings", () => {
    expect(isStepKey("vehicle")).toBe(true);
    expect(isStepKey("no_such")).toBe(false);
    expect(isStepKey(4)).toBe(false);
  });
});
