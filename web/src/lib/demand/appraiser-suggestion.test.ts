import { describe, expect, test } from "vitest";
import {
  EV_EXTRACTED,
  EV_RESOLVED,
  applySuggestion,
  pendingSuggestion,
  type SuggestionLine,
} from "./appraiser-suggestion";

const report = (document_id: string, o: Record<string, unknown> = {}) => ({
  type: EV_EXTRACTED,
  payload_json: {
    document_id, doc_type: "appraiser_report", repair: 7370, diminished_value: 1200, verified: true, ...o,
  },
});
const feeInvoice = (document_id: string, o: Record<string, unknown> = {}) => ({
  type: EV_EXTRACTED,
  payload_json: { document_id, doc_type: "assessor_fee_invoice", assessor_fee: 900, verified: true, ...o },
});
const resolved = (document_id: string, outcome = "dismissed") => ({
  type: EV_RESOLVED,
  payload_json: { document_id, outcome },
});
const live = new Map([
  ["d1", "appraiser_report"],
  ["f1", "assessor_fee_invoice"],
]);
const line = (key: SuggestionLine["key"], suggested: number, o: Partial<SuggestionLine> = {}): SuggestionLine => ({
  key, suggested, current: null, unverified: false, ...o,
});

describe("pendingSuggestion", () => {
  test("a fresh report extraction suggests both of its lines", () => {
    expect(pendingSuggestion([report("d1")], live, undefined)).toEqual({
      documentIds: ["d1"],
      lines: [line("repair", 7370), line("diminished_value", 1200)],
    });
  });

  test("the fee invoice adds the assessor-fee line to the same suggestion", () => {
    expect(pendingSuggestion([feeInvoice("f1"), report("d1")], live, undefined)).toEqual({
      documentIds: ["f1", "d1"],
      lines: [line("repair", 7370), line("diminished_value", 1200), line("assessor_fee", 900)],
    });
  });

  test("a fee invoice never suggests the report's lines", () => {
    const s = pendingSuggestion([feeInvoice("f1", { repair: 5000, diminished_value: 1 })], live, undefined);
    expect(s?.lines).toEqual([line("assessor_fee", 900)]);
  });

  test("a report that came with the fee invoice in one file suggests the fee too", () => {
    const combined = report("d1", { assessor_fee: 900, assessor_fee_verified: true });
    expect(pendingSuggestion([combined], live, undefined)).toEqual({
      documentIds: ["d1"],
      lines: [line("repair", 7370), line("diminished_value", 1200), line("assessor_fee", 900)],
    });
  });

  test("the fee read from a report is flagged by its own check, not the repair's", () => {
    const flags = (o: Record<string, unknown>) =>
      pendingSuggestion([report("d1", { assessor_fee: 900, ...o })], live, undefined)?.lines.map((l) => l.unverified);
    expect(flags({ verified: true, assessor_fee_verified: false })).toEqual([false, false, true]);
    expect(flags({ verified: false, assessor_fee_verified: true })).toEqual([true, false, false]);
  });

  test("a separate fee invoice filed after the combined report wins the fee line", () => {
    const s = pendingSuggestion([feeInvoice("f1", { assessor_fee: 950 }), report("d1", { assessor_fee: 900 })], live, undefined);
    expect(s?.lines.at(-1)).toEqual(line("assessor_fee", 950));
  });

  test("a typed amount that differs is shown as the current value", () => {
    const s = pendingSuggestion([report("d1")], live, { repair: { amount: 7000, vat: true } });
    expect(s?.lines[0]).toEqual(line("repair", 7370, { current: 7000 }));
  });

  test("lines the damages already hold are left out; nothing left → no suggestion", () => {
    const same = { repair: { amount: 7370, vat: true }, diminished_value: { amount: 1200, vat: false } };
    expect(pendingSuggestion([report("d1")], live, same)).toBeNull();
    const s = pendingSuggestion([feeInvoice("f1"), report("d1")], live, same);
    expect(s).toEqual({ documentIds: ["f1"], lines: [line("assessor_fee", 900)] });
  });

  test("a figure the document did not state is not suggested", () => {
    const s = pendingSuggestion([report("d1", { repair: null })], live, undefined);
    expect(s?.lines.map((l) => l.key)).toEqual(["diminished_value"]);
  });

  test("a resolution after the extraction closes that document only", () => {
    expect(pendingSuggestion([resolved("d1"), report("d1")], live, undefined)).toBeNull();
    const s = pendingSuggestion([resolved("d1"), feeInvoice("f1"), report("d1")], live, undefined);
    expect(s?.documentIds).toEqual(["f1"]);
  });

  test("a re-extraction after an older resolution is pending again", () => {
    expect(pendingSuggestion([report("d1"), resolved("d1"), report("d1")], live, undefined)).not.toBeNull();
  });

  test("a document that was deleted or re-filed no longer suggests; another live one does", () => {
    expect(pendingSuggestion([report("gone")], live, undefined)).toBeNull();
    expect(pendingSuggestion([report("f1")], live, undefined)).toBeNull(); // read as a report, now a fee invoice
    const two = new Map([...live, ["d0", "appraiser_report"]]);
    const s = pendingSuggestion([report("gone"), report("d0", { repair: 5000 })], two, undefined);
    expect(s?.lines[0].suggested).toBe(5000);
  });

  test("two reports: the newer reading wins each line", () => {
    const two = new Map([...live, ["d2", "appraiser_report"]]);
    const s = pendingSuggestion([report("d2", { repair: 8000, diminished_value: null }), report("d1")], two, undefined);
    expect(s).toEqual({
      documentIds: ["d2", "d1"],
      lines: [line("repair", 8000), line("diminished_value", 1200)],
    });
  });

  test("an unverified document flags its checked lines, never diminished value", () => {
    const s = pendingSuggestion([feeInvoice("f1", { verified: false }), report("d1", { verified: false })], live, undefined);
    expect(s?.lines.map((l) => [l.key, l.unverified])).toEqual([
      ["repair", true], ["diminished_value", false], ["assessor_fee", true],
    ]);
  });

  test("events from before doc_type existed count as appraiser reports; junk is skipped", () => {
    const old = { type: EV_EXTRACTED, payload_json: { document_id: "d1", repair: 7370, verified: true } };
    const events = [{ type: EV_EXTRACTED, payload_json: null }, { type: "other", payload_json: { document_id: "d1" } }, old];
    expect(pendingSuggestion(events, live, undefined)?.lines).toEqual([line("repair", 7370)]);
  });
});

describe("applySuggestion", () => {
  test("writes the lines with the default VAT flag and keeps everything else", () => {
    const out = applySuggestion(
      { towing: { amount: 600, vat: true }, claimant_vat_registered: true },
      [line("repair", 7370), line("diminished_value", 1200), line("assessor_fee", 900)],
    );
    expect(out).toEqual({
      towing: { amount: 600, vat: true },
      claimant_vat_registered: true,
      repair: { amount: 7370, vat: true },
      diminished_value: { amount: 1200, vat: false },
      assessor_fee: { amount: 900, vat: true },
    });
  });

  test("keeps a VAT flag the clerk already chose", () => {
    const out = applySuggestion({ repair: { amount: 1, vat: false } }, [line("repair", 7370, { current: 1 })]);
    expect(out.repair).toEqual({ amount: 7370, vat: false });
  });

  test("starts from nothing", () => {
    expect(applySuggestion(undefined, [line("repair", 10)])).toEqual({ repair: { amount: 10, vat: true } });
  });
});
