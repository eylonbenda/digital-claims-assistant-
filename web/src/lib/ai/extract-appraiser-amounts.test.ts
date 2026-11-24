import { describe, expect, it, vi } from "vitest";
import { extractAppraiserAmounts, parseAppraiserAmounts } from "./extract-appraiser-amounts";

const BYTES = new Uint8Array([1, 2, 3, 4]);
const answer = (o: Record<string, unknown>) =>
  JSON.stringify({ repair_before_vat: 0, repair_incl_vat: 0, diminished_value: 0, confident: true, ...o });

function fake(create: (...args: unknown[]) => unknown) {
  const fn = vi.fn(create);
  return { client: { messages: { create: fn } } as never, fn };
}

describe("parseAppraiserAmounts", () => {
  it("verifies a report whose before-VAT and VAT-inclusive totals agree", () => {
    expect(
      parseAppraiserAmounts(answer({ repair_before_vat: 7370, repair_incl_vat: 8696.6, diminished_value: 1200 })),
    ).toEqual({ repair: 7370, diminished_value: 1200, verified: true });
  });

  it("tolerates the report's own rounding of the VAT line", () => {
    expect(parseAppraiserAmounts(answer({ repair_before_vat: 7370, repair_incl_vat: 8697 }))).toEqual({
      repair: 7370, diminished_value: null, verified: true,
    });
  });

  it("still suggests, unverified, when the totals disagree (older VAT rate, misread digit)", () => {
    expect(parseAppraiserAmounts(answer({ repair_before_vat: 7370, repair_incl_vat: 8622.9 }))).toEqual({
      repair: 7370, diminished_value: null, verified: false,
    });
  });

  it("is unverified when the report prints no VAT-inclusive total to check against", () => {
    expect(parseAppraiserAmounts(answer({ repair_before_vat: 7370 }))?.verified).toBe(false);
  });

  it("derives the before-VAT figure from a lone VAT-inclusive total, unverified", () => {
    expect(parseAppraiserAmounts(answer({ repair_incl_vat: 11800 }))).toEqual({
      repair: 10000, diminished_value: null, verified: false,
    });
  });

  it("returns a lone diminished value (total-loss report)", () => {
    expect(parseAppraiserAmounts(answer({ diminished_value: 3500 }))).toEqual({
      repair: null, diminished_value: 3500, verified: false,
    });
  });

  it("returns nothing when unsure, empty, malformed or impossible", () => {
    expect(parseAppraiserAmounts(answer({ repair_before_vat: 7370, confident: false }))).toBeNull();
    expect(parseAppraiserAmounts(answer({}))).toBeNull();
    expect(parseAppraiserAmounts("not json")).toBeNull();
    expect(parseAppraiserAmounts("null")).toBeNull();
    expect(parseAppraiserAmounts(answer({ repair_before_vat: -5 }))).toBeNull();
    expect(parseAppraiserAmounts(answer({ repair_before_vat: 2_000_000 }))).toBeNull();
    expect(parseAppraiserAmounts(answer({ repair_before_vat: "7370" }))).toBeNull();
  });

  it("rounds to agorot", () => {
    expect(parseAppraiserAmounts(answer({ diminished_value: 1200.456 }))?.diminished_value).toBe(1200.46);
  });
});

describe("extractAppraiserAmounts", () => {
  it("returns the parsed figures for a PDF", async () => {
    const { client, fn } = fake(async () => ({
      content: [{ type: "text", text: answer({ repair_before_vat: 1000, repair_incl_vat: 1180 }) }],
    }));
    expect(await extractAppraiserAmounts(BYTES, "pdf", { client })).toEqual({
      repair: 1000, diminished_value: null, verified: true,
    });
    const req = fn.mock.calls[0][0] as { messages: { content: { type: string }[] }[] };
    expect(req.messages[0].content[0].type).toBe("document");
  });

  it("returns nothing for a HEIC, without calling the model", async () => {
    const { client, fn } = fake(async () => ({ content: [] }));
    expect(await extractAppraiserAmounts(BYTES, "heic", { client })).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns nothing with no API key, on a failed call and on a timeout", async () => {
    expect(await extractAppraiserAmounts(BYTES, "pdf", { client: null })).toBeNull();
    const failing = fake(async () => { throw new Error("529 overloaded"); });
    expect(await extractAppraiserAmounts(BYTES, "pdf", { client: failing.client })).toBeNull();
    const hanging = fake(() => new Promise(() => {}));
    expect(await extractAppraiserAmounts(BYTES, "pdf", { client: hanging.client, timeoutMs: 20 })).toBeNull();
  });
});

describe("parseAssessorFee", () => {
  const fee = (o: Record<string, unknown>) =>
    JSON.stringify({ fee_before_vat: 0, fee_incl_vat: 0, confident: true, ...o });

  it("verifies a fee whose two totals agree", async () => {
    const { parseAssessorFee } = await import("./extract-appraiser-amounts");
    expect(parseAssessorFee(fee({ fee_before_vat: 900, fee_incl_vat: 1062 }))).toEqual({
      assessor_fee: 900, verified: true,
    });
  });

  it("derives the net fee from a lone VAT-inclusive total, unverified", async () => {
    const { parseAssessorFee } = await import("./extract-appraiser-amounts");
    expect(parseAssessorFee(fee({ fee_incl_vat: 1180 }))).toEqual({ assessor_fee: 1000, verified: false });
    expect(parseAssessorFee(fee({ fee_before_vat: 900, fee_incl_vat: 1000 }))?.verified).toBe(false);
  });

  it("returns nothing when unsure, empty, malformed or impossible", async () => {
    const { parseAssessorFee } = await import("./extract-appraiser-amounts");
    expect(parseAssessorFee(fee({ fee_before_vat: 900, confident: false }))).toBeNull();
    expect(parseAssessorFee(fee({}))).toBeNull();
    expect(parseAssessorFee("[]")).toBeNull();
    expect(parseAssessorFee(fee({ fee_before_vat: -1 }))).toBeNull();
  });

  it("extractAssessorFee asks the model and never throws", async () => {
    const { extractAssessorFee } = await import("./extract-appraiser-amounts");
    const ok = fake(async () => ({ content: [{ type: "text", text: fee({ fee_before_vat: 900, fee_incl_vat: 1062 }) }] }));
    expect(await extractAssessorFee(BYTES, "pdf", { client: ok.client })).toEqual({ assessor_fee: 900, verified: true });
    const failing = fake(async () => { throw new Error("boom"); });
    expect(await extractAssessorFee(BYTES, "pdf", { client: failing.client })).toBeNull();
  });
});
