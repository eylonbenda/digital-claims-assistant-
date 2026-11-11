import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderDemandPdf, renderDemandPdfDebug, MARGIN } from "./render";
import { buildDemandData } from "./data";

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
