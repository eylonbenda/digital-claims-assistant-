import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderDemandPdf, renderDemandPdfDebug, MARGIN } from "./render";
import { buildDemandData, type DemandDoc } from "./data";
import sampleClaim from "../formfill/sample-claim";

const empty = () =>
  buildDemandData({
    data: null,
    sender: { name: null, phone: null, email: null },
    addresseeKey: null,
    carAtGarageAt: null,
    now: new Date("2026-11-11T10:00:00Z"),
  });

describe("renderDemandPdf", () => {
  it("renders a one-page PDF", async () => {
    const bytes = await renderDemandPdf(empty());
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("renders an empty doc without throwing", async () => {
    await expect(renderDemandPdf(empty())).resolves.toBeInstanceOf(Uint8Array);
  });

  it("wraps a 600-character description without throwing", async () => {
    const doc = buildDemandData({
      data: { accident: { description: "תיאור האירוע ".repeat(50).trim().slice(0, 600) } },
      sender: { name: "ישראל", phone: "050", email: "a@b.co" },
      addresseeKey: null,
      carAtGarageAt: null,
      now: new Date("2026-11-11T10:00:00Z"),
    });
    const bytes = await renderDemandPdf(doc);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("overflow handling", () => {
  it("truncates to stay above the bottom margin and marks it with an ellipsis", async () => {
    const long = "מילה ארוכה מאוד בתיאור ".repeat(300).trim();
    const doc = buildDemandData({
      data: {
        accident: { description: long },
        vehicle: { manufacturer: long, year: long },
        insured: { first_name: long, last_name: long, mobile: long },
        third_parties: [
          { driver_name: long, id_number: long, phone: long },
          { driver_name: long, id_number: long, phone: long },
        ],
        assessor_name: long,
      },
      sender: { name: long, phone: "050", email: "a@b.co" },
      addresseeKey: null,
      carAtGarageAt: null,
      now: new Date("2026-11-11T10:00:00Z"),
    });
    const { drawn } = await renderDemandPdfDebug(doc);
    expect(drawn.length).toBeGreaterThan(10);
    expect(Math.min(...drawn.map((d) => d.y))).toBeGreaterThanOrEqual(MARGIN);
    expect(drawn.some((d) => d.text.endsWith("…"))).toBe(true);
  });
  it("exercises the cap loop: long multi-word values wrap, then get capped", async () => {
    const long = "מילה ארוכה מאוד בתיאור ".repeat(300).trim();
    const doc = buildDemandData({
      data: { accident: { description: long }, assessor_name: long, policy_number: long },
      sender: { name: "x", phone: "", email: "" },
      addresseeKey: null,
      carAtGarageAt: null,
      now: new Date("2026-11-11T10:00:00Z"),
    });
    const { drawn } = await renderDemandPdfDebug(doc);
    // Far more than one line per value was drawn (wrapping), yet nothing below the margin.
    expect(drawn.filter((d) => d.text.includes("מילה ארוכה")).length).toBeGreaterThan(20);
    expect(Math.min(...drawn.map((d) => d.y))).toBeGreaterThanOrEqual(MARGIN);
    expect(drawn.some((d) => d.text.endsWith("…"))).toBe(true);
  });
});

describe("wrapping and Latin text", () => {
  const mk = (description: string, email: string) =>
    buildDemandData({
      data: { accident: { description } },
      sender: { name: "ישראל", phone: "050", email },
      addresseeKey: null,
      carAtGarageAt: null,
      now: new Date("2026-11-11T10:00:00Z"),
    });

  it("wraps a multi-word Hebrew value onto more than one line", async () => {
    const { drawn } = await renderDemandPdfDebug(mk("נסעתי ישר בדרך ".repeat(20).trim(), ""));
    expect(drawn.filter((d) => d.text.includes("נסעתי")).length).toBeGreaterThan(1);
  });

  it("draws Latin text containing s intact", async () => {
    const { drawn } = await renderDemandPdfDebug(mk("x", "sales@shop.co.il"));
    expect(drawn.some((d) => d.text === "sales@shop.co.il")).toBe(true);
  });
});

describe("damages and pagination", () => {
  const tp = (n: number) => ({
    driver_name: `נהג צד ג' מספר ${n}`,
    id_number: "012345678",
    phone: "050-1234567",
    vehicle_plate: "12-345-67",
    insurer: "הראל",
  });
  const crowded = () =>
    buildDemandData({
      data: {
        ...sampleClaim,
        accident: { ...sampleClaim.accident, description: "תיאור האירוע ".repeat(50).trim().slice(0, 600) },
        third_parties: [tp(1), tp(2), tp(3)],
        damages: {
          repair: { amount: 7370, vat: true },
          diminished_value: { amount: 2500, vat: false },
          assessor_fee: { amount: 677.97, vat: true },
          towing: { amount: 450, vat: true },
          other: Array.from({ length: 10 }, (_, i) => ({ label: `סעיף נוסף מספר ${i + 1}`, amount: 1000 + i * 111.11 })),
        },
      },
      sender: { name: "מוסך לדוגמה", phone: "03-1234567", email: "garage@example.com" },
      addresseeKey: null,
      carAtGarageAt: "2026-11-02",
      now: new Date("2026-11-11T10:00:00Z"),
    });
  const moneyRows = (doc: DemandDoc) => doc.sections.flatMap((s) => s.rows).filter((r) => r.kind);

  it("a crowded claim flows to a second page and draws every amount", async () => {
    const doc = crowded();
    const rows = moneyRows(doc);
    expect(rows.length).toBe(16);
    const { bytes, drawn } = await renderDemandPdfDebug(doc);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(drawn.map((d) => d.text)).toContain(r.value);
    for (const r of rows) expect(drawn.some((d) => d.text === r.label + ":")).toBe(true);
    expect(Math.min(...drawn.map((d) => d.y))).toBeGreaterThanOrEqual(MARGIN);
    expect(drawn.some((d) => d.page === 1)).toBe(true);
  });

  it("money rows are never capped", async () => {
    const doc = crowded();
    const values = new Set(moneyRows(doc).map((r) => r.value));
    const { drawn } = await renderDemandPdfDebug(doc);
    const money = drawn.filter((d) => /₪/.test(d.text));
    expect(money.length).toBeGreaterThanOrEqual(values.size);
    for (const d of money) {
      expect(d.text).not.toContain("…");
      expect(values.has(d.text)).toBe(true);
    }
  });

  it("a section heading moves to the next page with its first row", async () => {
    const doc = crowded();
    const { drawn } = await renderDemandPdfDebug(doc);
    for (const s of doc.sections) {
      const h = drawn.find((d) => d.text === s.heading);
      const first = drawn.find((d) => d.text === s.rows[0].label + ":" && h && d.page === h.page && d.y < h.y);
      expect(h, s.heading).toBeDefined();
      expect(first, s.heading).toBeDefined();
    }
  });

  it("the acceptance doc stays on one page", async () => {
    const doc = buildDemandData({
      data: sampleClaim,
      sender: { name: "מוסך לדוגמה", phone: "03-1234567", email: "garage@example.com" },
      addresseeKey: null,
      carAtGarageAt: "2026-11-02",
      now: new Date("2026-11-11T10:00:00Z"),
    });
    expect(doc.sections.some((s) => s.money)).toBe(true);
    const { bytes, drawn } = await renderDemandPdfDebug(doc);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(drawn.map((d) => d.text)).toContain("7,370.00 ₪");
    expect(drawn.every((d) => d.page === 0)).toBe(true);
  });

  it("a money value wider than its column moves to its own line instead of being clipped", async () => {
    const doc = buildDemandData({
      data: { damages: { other: [{ label: "ש".repeat(60), amount: 1_000_000 }] } },
      sender: { name: null, phone: null, email: null },
      addresseeKey: null,
      carAtGarageAt: null,
      now: new Date("2026-11-11T10:00:00Z"),
    });
    const { drawn } = await renderDemandPdfDebug(doc);
    const label = drawn.find((d) => d.text === "ש".repeat(60) + ":")!;
    const value = drawn.find((d) => d.text === "1,000,000.00 ₪")!;
    expect(value.y).toBeLessThan(label.y);
    expect(drawn.some((d) => d.text.includes("…"))).toBe(false);
  });
});
