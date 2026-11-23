import { describe, expect, test } from "vitest";
import { EV_EXTRACTED, EV_RESOLVED, applySuggestion, pendingSuggestion } from "./appraiser-suggestion";

const extracted = (document_id: string, o: Record<string, unknown> = {}) => ({
  type: EV_EXTRACTED,
  payload_json: { document_id, repair: 7370, diminished_value: 1200, verified: true, ...o },
});
const resolved = (document_id: string, outcome = "dismissed") => ({
  type: EV_RESOLVED,
  payload_json: { document_id, outcome },
});
const live = new Set(["d1"]);

describe("pendingSuggestion", () => {
  test("a fresh extraction suggests both lines", () => {
    expect(pendingSuggestion([extracted("d1")], live, undefined)).toEqual({
      documentId: "d1",
      verified: true,
      lines: [
        { key: "repair", suggested: 7370, current: null },
        { key: "diminished_value", suggested: 1200, current: null },
      ],
    });
  });

  test("a typed amount that differs is shown as the current value", () => {
    const s = pendingSuggestion([extracted("d1")], live, { repair: { amount: 7000, vat: true } });
    expect(s?.lines[0]).toEqual({ key: "repair", suggested: 7370, current: 7000 });
  });

  test("lines the damages already hold are left out; nothing left → no suggestion", () => {
    const same = { repair: { amount: 7370, vat: true }, diminished_value: { amount: 1200, vat: false } };
    expect(pendingSuggestion([extracted("d1")], live, same)).toBeNull();
    const s = pendingSuggestion([extracted("d1")], live, { repair: { amount: 7370, vat: true } });
    expect(s?.lines.map((l) => l.key)).toEqual(["diminished_value"]);
  });

  test("a figure the report did not state is not suggested", () => {
    const s = pendingSuggestion([extracted("d1", { repair: null })], live, undefined);
    expect(s?.lines.map((l) => l.key)).toEqual(["diminished_value"]);
  });

  test("a resolution after the extraction closes it", () => {
    expect(pendingSuggestion([resolved("d1"), extracted("d1")], live, undefined)).toBeNull();
  });

  test("a re-extraction after an older resolution is pending again", () => {
    expect(pendingSuggestion([extracted("d1"), resolved("d1"), extracted("d1")], live, undefined)).not.toBeNull();
  });

  test("a report that was deleted or re-filed no longer suggests; an older live one does", () => {
    expect(pendingSuggestion([extracted("gone")], live, undefined)).toBeNull();
    const s = pendingSuggestion([extracted("gone"), extracted("d1", { repair: 5000 })], live, undefined);
    expect(s?.lines[0].suggested).toBe(5000);
  });

  test("another document's resolution does not close this one", () => {
    expect(pendingSuggestion([resolved("d2"), extracted("d1")], live, undefined)).not.toBeNull();
  });

  test("an unverified extraction stays unverified; junk payloads are skipped", () => {
    const events = [{ type: EV_EXTRACTED, payload_json: null }, extracted("d1", { verified: false })];
    expect(pendingSuggestion(events, live, undefined)?.verified).toBe(false);
  });
});

describe("applySuggestion", () => {
  test("writes the lines with the default VAT flag and keeps everything else", () => {
    const out = applySuggestion(
      { assessor_fee: { amount: 600, vat: true }, claimant_vat_registered: true },
      [
        { key: "repair", suggested: 7370, current: null },
        { key: "diminished_value", suggested: 1200, current: null },
      ],
    );
    expect(out).toEqual({
      assessor_fee: { amount: 600, vat: true },
      claimant_vat_registered: true,
      repair: { amount: 7370, vat: true },
      diminished_value: { amount: 1200, vat: false },
    });
  });

  test("keeps a VAT flag the clerk already chose", () => {
    const out = applySuggestion({ repair: { amount: 1, vat: false } }, [{ key: "repair", suggested: 7370, current: 1 }]);
    expect(out.repair).toEqual({ amount: 7370, vat: false });
  });

  test("starts from nothing", () => {
    expect(applySuggestion(undefined, [{ key: "repair", suggested: 10, current: null }])).toEqual({
      repair: { amount: 10, vat: true },
    });
  });
});
