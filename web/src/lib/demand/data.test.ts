import { describe, it, expect } from "vitest";
import sampleClaim from "../formfill/sample-claim";
import { buildDemandData, resolveAddressee, type DemandDoc } from "./data";
import { COPY } from "./copy";
import type { ClaimData } from "../formfill/types";

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

describe("damages section", () => {
  const damages = {
    repair: { amount: 7370, vat: true },
    assessor_fee: { amount: 677.97, vat: true },
  };
  const build = (dm: ClaimData["damages"]) =>
    buildDemandData({ data: { ...sampleClaim, damages: dm }, sender, addresseeKey: null, carAtGarageAt: null, now });
  const sec = (d: DemandDoc) => d.sections.find((s) => s.heading.startsWith("פירוט הנזק"));

  it("renders rows, VAT and total after third parties and before 'other'", () => {
    const d = build(damages);
    const s = sec(d)!;
    expect(s.heading).toBe("פירוט הנזק (כולל מע״מ)");
    expect(s.money).toBe(true);
    expect(s.rows.map((r) => [r.label, r.value])).toEqual([
      ["תיקון הרכב", "7,370.00 ₪"],
      ["שכ״ט שמאי", "677.97 ₪"],
      ["מע״מ (18%)", "1,448.63 ₪"],
      ["סה״כ לדרישה", "9,496.60 ₪"],
    ]);
    expect(s.rows.map((r) => r.kind)).toEqual(["money", "money", "money", "total"]);
    const i = d.sections.indexOf(s);
    expect(d.sections[i + 1].heading).toBe(COPY.sections.other);
    expect(d.sections[i - 1].heading.startsWith(COPY.sections.thirdParty)).toBe(true);
  });
  it("VAT-registered claimant: before-VAT heading, no VAT row", () => {
    const s = sec(build({ ...damages, claimant_vat_registered: true }))!;
    expect(s.heading).toBe("פירוט הנזק (לפני מע״מ)");
    expect(s.rows.some((r) => r.label.startsWith("מע״מ"))).toBe(false);
    expect(s.rows[s.rows.length - 1].value).toBe("8,047.97 ₪");
  });
  it("fixed labels and other lines", () => {
    const s = sec(build({
      diminished_value: { amount: 100, vat: false },
      towing: { amount: 200, vat: true },
      other: [{ label: "החלפת מנעול", amount: 50 }],
    }))!;
    const labels = s.rows.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["ירידת ערך", "גרירה", "החלפת מנעול"]));
  });
  it("no damages -> no section", () => {
    expect(sec(build(undefined))).toBeUndefined();
    expect(sec(build({}))).toBeUndefined();
  });
});

describe("third-party insurer row", () => {
  const tp = (insurer: string | undefined) => ({ driver_name: "אבי", vehicle_plate: "87654321", insurer });
  const insurerOf = (third_parties: ClaimData["third_parties"], addresseeKey: string | null) =>
    val(
      rowsOf(
        buildDemandData({ data: { third_parties }, sender, addresseeKey, carAtGarageAt: null, now }),
        COPY.sections.thirdParty,
      ),
      COPY.labels.insurer,
    );

  it("prints the addressee when the single third party's insurer was unknown", () => {
    expect(insurerOf([tp("לא ידוע")], "migdal")).toBe("מגדל");
    expect(insurerOf([tp(undefined)], "migdal")).toBe("מגדל");
  });

  it("keeps a stated insurer, including 'לא מבוטח'", () => {
    expect(insurerOf([tp("הראל")], "migdal")).toBe("הראל");
    expect(insurerOf([tp("לא מבוטח")], "migdal")).toBe("לא מבוטח");
  });

  it("infers nothing with several vehicles or no addressee", () => {
    expect(insurerOf([tp("לא ידוע"), tp("הראל")], "migdal")).toBe("לא ידוע");
    expect(insurerOf([tp("לא ידוע")], null)).toBe("לא ידוע");
  });
});
