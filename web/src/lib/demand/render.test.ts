import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderDemandPdf } from "./render";
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
