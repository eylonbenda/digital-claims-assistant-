import { describe, expect, it } from "vitest";
import { STEPS, docsSatisfied, firstIncompleteKey, isStepKey, visibleSteps } from "./steps";
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

  it("stops at documents when the required uploads are still owed", () => {
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
    // Everything typed, but no licence/registration yet — resume must land on
    // documents rather than skipping to summary and submitting past the requirement.
    expect(firstIncompleteKey(full)).toBe("documents");
    // Satisfy them (one uploaded, one deferred) and it falls through to summary.
    expect(
      firstIncompleteKey({
        ...full,
        documents: [{ localId: "1", type: "drivers_license", name: "a.jpg", status: "done" }],
        docsDeferred: { vehicle_reg: true },
      }),
    ).toBe("summary");
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

  it("driver_who completes and skips driver_details when the car was parked", () => {
    const parked: State = { ...BASE, driver: { ...BASE.driver, parked: true } };
    const who = STEPS.find((s) => s.key === "driver_who")!;
    expect(who.isComplete(parked)).toBe(true);
    expect(visibleSteps(parked).map((s) => s.key)).not.toContain("driver_details");
  });

  it("tp_details.isComplete passes on details_unknown even with empty fields", () => {
    const step = STEPS.find((s) => s.key === "tp_details")!;
    const hitAndRun: State = {
      ...BASE,
      thirdParty: { ...BASE.thirdParty, present: true, details_unknown: true },
    };
    expect(step.isComplete(hitAndRun)).toBe(true);
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

describe("required documents (pilot 2026-09-27)", () => {
  const doc = (type: "drivers_license" | "vehicle_reg" | "car_photo", status: "done" | "uploading" | "error" = "done") =>
    ({ localId: `${type}-${status}`, type, name: "f.jpg", status }) as const;

  it("is not satisfied by an empty documents list", () => {
    expect(docsSatisfied(BASE)).toBe(false);
  });

  it("needs both the licence and the registration, not just one", () => {
    expect(docsSatisfied({ ...BASE, documents: [doc("drivers_license")] })).toBe(false);
    expect(docsSatisfied({ ...BASE, documents: [doc("vehicle_reg")] })).toBe(false);
    expect(docsSatisfied({ ...BASE, documents: [doc("drivers_license"), doc("vehicle_reg")] })).toBe(true);
  });

  it("ignores car photos, which stay optional", () => {
    expect(docsSatisfied({ ...BASE, documents: [doc("car_photo")] })).toBe(false);
    expect(
      docsSatisfied({
        ...BASE,
        documents: [doc("drivers_license"), doc("vehicle_reg"), doc("car_photo")],
      }),
    ).toBe(true);
  });

  it("does not count an upload that never finished", () => {
    expect(
      docsSatisfied({ ...BASE, documents: [doc("drivers_license", "uploading"), doc("vehicle_reg")] }),
    ).toBe(false);
    expect(
      docsSatisfied({ ...BASE, documents: [doc("drivers_license", "error"), doc("vehicle_reg")] }),
    ).toBe(false);
  });

  // R2: every mandatory field needs an escape hatch, or real clients get stuck.
  it("accepts an explicit deferral in place of an upload", () => {
    expect(docsSatisfied({ ...BASE, docsDeferred: { drivers_license: true, vehicle_reg: true } })).toBe(true);
    expect(
      docsSatisfied({ ...BASE, documents: [doc("vehicle_reg")], docsDeferred: { drivers_license: true } }),
    ).toBe(true);
  });

  it("treats a false or absent deferral as unsatisfied", () => {
    expect(docsSatisfied({ ...BASE, docsDeferred: { drivers_license: false, vehicle_reg: true } })).toBe(false);
    expect(docsSatisfied({ ...BASE, docsDeferred: { vehicle_reg: true } })).toBe(false);
  });

  it("the documents step in the registry uses that rule", () => {
    const step = STEPS.find((s) => s.key === "documents")!;
    expect(step.isComplete(BASE)).toBe(false);
    expect(step.isComplete({ ...BASE, docsDeferred: { drivers_license: true, vehicle_reg: true } })).toBe(true);
  });
});
