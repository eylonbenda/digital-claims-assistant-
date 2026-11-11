import { describe, it, expect } from "vitest";
import { demandInputs, parseDemandFormBody } from "./inputs";

describe("parseDemandFormBody", () => {
  it("treats a missing body or field as no change", () => {
    expect(parseDemandFormBody(null)).toEqual({ ok: true, atFaultInsurer: null });
    expect(parseDemandFormBody({})).toEqual({ ok: true, atFaultInsurer: null });
    expect(parseDemandFormBody({ at_fault_insurer: null })).toEqual({ ok: true, atFaultInsurer: null });
    expect(parseDemandFormBody({ at_fault_insurer: "" })).toEqual({ ok: true, atFaultInsurer: null });
  });
  it("accepts a directory key", () => {
    expect(parseDemandFormBody({ at_fault_insurer: "migdal" })).toEqual({ ok: true, atFaultInsurer: "migdal" });
  });
  it("rejects unknown keys, labels, non-strings and prototype keys", () => {
    expect(parseDemandFormBody({ at_fault_insurer: "nope" })).toEqual({ ok: false });
    expect(parseDemandFormBody({ at_fault_insurer: "מגדל" })).toEqual({ ok: false });
    expect(parseDemandFormBody({ at_fault_insurer: 3 })).toEqual({ ok: false });
    expect(parseDemandFormBody({ at_fault_insurer: "toString" })).toEqual({ ok: false });
    expect(parseDemandFormBody([])).toEqual({ ok: false });
    expect(parseDemandFormBody("migdal")).toEqual({ ok: false });
  });
});

describe("demandInputs", () => {
  const tick = (key: string, done: boolean, at: string) => ({
    type: "milestone_ticked",
    payload_json: { key, done },
    created_at: at,
  });

  it("resolves addressee, sender and car-at-garage date", () => {
    const r = demandInputs({
      atFaultInsurer: null,
      tpInsurers: ["מגדל"],
      agent: { name: "מוסך", phone: "03-1", email: null },
      events: [tick("car_at_garage", true, "2026-11-01T08:00:00Z"), tick("other", true, "2026-11-02T08:00:00Z")],
    });
    expect(r).toEqual({
      addresseeKey: "migdal",
      sender: { name: "מוסך", phone: "03-1", email: null },
      carAtGarageAt: "2026-11-01T08:00:00Z",
    });
  });

  it("prefers at_fault_insurer and tolerates a missing agent and an un-ticked milestone", () => {
    const r = demandInputs({
      atFaultInsurer: "harel",
      tpInsurers: ["מגדל"],
      agent: null,
      events: [tick("car_at_garage", true, "2026-11-01T08:00:00Z"), tick("car_at_garage", false, "2026-11-03T08:00:00Z")],
    });
    expect(r.addresseeKey).toBe("harel");
    expect(r.sender).toEqual({ name: null, phone: null, email: null });
    expect(r.carAtGarageAt).toBeNull();
  });
});
