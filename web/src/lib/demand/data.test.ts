import { describe, it, expect } from "vitest";
import sampleClaim from "../formfill/sample-claim";
import { buildDemandData, resolveAddressee, type DemandDoc } from "./data";
import { COPY } from "./copy";

const sender = { name: "מוסך דוגמה", phone: "03-1234567", email: "g@example.com" };
const now = new Date("2026-11-11T10:00:00Z");
const rowsOf = (d: DemandDoc, heading: string) =>
  d.sections.filter((s) => s.heading.startsWith(heading)).flatMap((s) => s.rows);
const val = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value;

describe("resolveAddressee", () => {
  it("resolves a set at-fault insurer (key or free text)", () => {
    expect(resolveAddressee("migdal", [])).toBe("migdal");
    expect(resolveAddressee("מגדל", [])).toBe("migdal");
  });
  it("uses third-party insurers when they all agree", () => {
    expect(resolveAddressee(null, ["מגדל", "מגדל"])).toBe("migdal");
  });
  it("returns null on disagreement, sentinels, unresolved and empty", () => {
    expect(resolveAddressee(null, ["מגדל", "הראל"])).toBeNull();
    expect(resolveAddressee(null, ["לא ידוע"])).toBeNull();
    expect(resolveAddressee(null, ["לא מבוטח"])).toBeNull();
    expect(resolveAddressee(null, ["מגדל", "חברה לא מוכרת"])).toBeNull();
    expect(resolveAddressee(null, ["מגדל", null])).toBeNull();
    expect(resolveAddressee(null, [])).toBeNull();
    expect(resolveAddressee("לא ידוע", [])).toBeNull();
  });
});

describe("buildDemandData", () => {
  const doc = buildDemandData({
    data: sampleClaim,
    sender,
    addresseeKey: "migdal",
    carAtGarageAt: "2026-10-30T08:00:00Z",
    now,
  });

  it("header", () => {
    expect(doc.date).toBe("11/11/2026");
    expect(doc.addressee).toBe("מגדל");
    expect(doc.sender).toEqual(sender);
    expect(doc.title).toBe(COPY.title);
  });
  it("vehicle, insured, policy", () => {
    expect(val(rowsOf(doc, COPY.sections.vehicle), COPY.labels.makeModel)).toBe("טויוטה");
    expect(val(rowsOf(doc, COPY.sections.insured), COPY.labels.phone)).toBe("054-1234567");
    expect(val(rowsOf(doc, COPY.sections.policy), COPY.labels.insuranceType)).toBe("מקיף");
    expect(val(rowsOf(doc, COPY.sections.policy), COPY.labels.policyNumber)).toBe("40123567");
  });
  it("event has one row from description only", () => {
    const rows = rowsOf(doc, COPY.sections.event);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(sampleClaim.accident!.description);
  });
  it("one group per third party", () => {
    const two = buildDemandData({
      data: { ...sampleClaim, third_parties: [{ owner_name: "א" }, { driver_name: "ב", owner_name: "ג" }] },
      sender, addresseeKey: null, carAtGarageAt: null, now,
    });
    const tp = two.sections.filter((s) => s.heading.startsWith(COPY.sections.thirdParty));
    expect(tp).toHaveLength(2);
    expect(val(tp[1].rows, COPY.labels.name)).toBe("ב");
    const one = doc.sections.filter((s) => s.heading.startsWith(COPY.sections.thirdParty));
    expect(one).toHaveLength(1);
    expect(val(one[0].rows, COPY.labels.insurer)).toBe("הראל");
  });
  it("other: police, garage date, appraiser", () => {
    const other = rowsOf(doc, COPY.sections.other);
    expect(val(other, COPY.labels.police)).toBe("לא");
    expect(val(other, COPY.labels.carAtGarage)).toBe("30/10/2026");
    expect(val(other, COPY.labels.appraiser)).toBe("שמאי אבי לוי");
    const noPolice = buildDemandData({
      data: { ...sampleClaim, accident: { ...sampleClaim.accident, police: undefined } },
      sender, addresseeKey: null, carAtGarageAt: null, now,
    });
    expect(val(rowsOf(noPolice, COPY.sections.other), COPY.labels.police)).toBe("");
    const yes = buildDemandData({
      data: { ...sampleClaim, accident: { ...sampleClaim.accident, police: { notified: true } } },
      sender, addresseeKey: null, carAtGarageAt: null, now,
    });
    expect(val(rowsOf(yes, COPY.sections.other), COPY.labels.police)).toBe("כן");
  });
  it("null data yields only strings, no undefined/null text", () => {
    const empty = buildDemandData({
      data: null,
      sender: { name: null, phone: null, email: null },
      addresseeKey: null, carAtGarageAt: null, now,
    });
    const all: unknown[] = [empty.date, empty.addressee, empty.title, ...Object.values(empty.sender)];
    for (const r of empty.subtitle) all.push(r.label, r.value);
    for (const s of empty.sections) { all.push(s.heading); for (const r of s.rows) all.push(r.label, r.value); }
    for (const v of all) {
      expect(typeof v).toBe("string");
      expect(v).not.toBe("undefined");
      expect(v).not.toBe("null");
    }
    expect(empty.addressee).toBe("");
  });
});
