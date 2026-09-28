import { describe, expect, it } from "vitest";
import { furthestStep, summarizeFunnel, type FunnelRow } from "./funnel";

let seq = 0;
function row(over: Partial<FunnelRow> = {}): FunnelRow {
  seq += 1;
  return {
    id: `c${seq}`,
    created_at: "2026-09-20T08:00:00Z",
    submitted_at: null,
    summary_json: null,
    ...over,
  };
}
const draft = (o: Record<string, unknown>) => ({ draft: o });
const submitted = (o: Record<string, unknown> = {}) => ({
  collected: {},
  funnel: { completed: true, max_step_key: "summary", ...o },
});

describe("furthestStep", () => {
  it("returns null when nothing was ever saved", () => {
    expect(furthestStep(null)).toBeNull();
    expect(furthestStep({})).toBeNull();
    expect(furthestStep(draft({}))).toBeNull();
  });

  it("prefers the monotonic max_step_key over the last step_key", () => {
    // The claimant reached description, then navigated back to vehicle and stopped.
    expect(furthestStep(draft({ step_key: "vehicle", max_step_key: "description" }))).toBe(
      "description",
    );
  });

  it("falls back to step_key for drafts written before max_step_key existed", () => {
    expect(furthestStep(draft({ step_key: "insured" }))).toBe("insured");
  });

  it("ignores a step key it doesn't recognise", () => {
    expect(furthestStep(draft({ step_key: "nonsense_step" }))).toBeNull();
    expect(furthestStep(draft({ max_step_key: 7, step_key: "fault" }))).toBe("fault");
  });
});

describe("summarizeFunnel", () => {
  it("is all zeroes and does not divide by zero on an empty book", () => {
    const s = summarizeFunnel([]);
    expect(s.links_sent).toBe(0);
    expect(s.completion_rate).toBe(0);
    expect(s.abandoned_at).toEqual([]);
  });

  it("counts completion against every link sent, not just the ones that started", () => {
    const rows = [
      row({ submitted_at: "2026-09-21T09:00:00Z", summary_json: submitted() }),
      row({ submitted_at: "2026-09-21T10:00:00Z", summary_json: submitted() }),
      row({ summary_json: draft({ max_step_key: "documents" }) }),
      row(), // link never opened
    ];
    const s = summarizeFunnel(rows);
    expect(s.links_sent).toBe(4);
    expect(s.submitted).toBe(2);
    expect(s.abandoned).toBe(2);
    expect(s.completion_rate).toBe(0.5);
    expect(s.never_started).toBe(1);
  });

  it("separates a link that was never opened from one abandoned mid-flow", () => {
    const s = summarizeFunnel([
      row(),
      row({ summary_json: draft({ max_step_key: "insured" }) }),
    ]);
    expect(s.never_started).toBe(1);
    expect(s.abandoned_at).toEqual([{ step: "insured", count: 1 }]);
  });

  it("reports abandonment points in flow order, not by count", () => {
    const s = summarizeFunnel([
      row({ summary_json: draft({ max_step_key: "documents" }) }),
      row({ summary_json: draft({ max_step_key: "documents" }) }),
      row({ summary_json: draft({ max_step_key: "injuries" }) }),
      row({ summary_json: draft({ max_step_key: "vehicle" }) }),
    ]);
    expect(s.abandoned_at).toEqual([
      { step: "injuries", count: 1 },
      { step: "vehicle", count: 1 },
      { step: "documents", count: 2 },
    ]);
  });

  it("does not count a submitted claim as abandoned at its last step", () => {
    const s = summarizeFunnel([
      row({ submitted_at: "2026-09-21T09:00:00Z", summary_json: submitted() }),
    ]);
    expect(s.abandoned).toBe(0);
    expect(s.abandoned_at).toEqual([]);
  });

  // This is the number that says whether requiring the uploads was the right call:
  // a high deferral rate means clients genuinely cannot photograph them on the spot.
  it("tallies deferred documents per type across submitted claims", () => {
    const s = summarizeFunnel([
      row({
        submitted_at: "2026-09-21T09:00:00Z",
        summary_json: submitted({ docs_deferred: ["drivers_license", "vehicle_reg"] }),
      }),
      row({
        submitted_at: "2026-09-21T10:00:00Z",
        summary_json: submitted({ docs_deferred: ["vehicle_reg"] }),
      }),
      row({ submitted_at: "2026-09-21T11:00:00Z", summary_json: submitted() }),
    ]);
    expect(s.docs_deferred).toEqual({ drivers_license: 1, vehicle_reg: 2 });
  });

  it("survives junk in the deferral list", () => {
    const s = summarizeFunnel([
      row({
        submitted_at: "2026-09-21T09:00:00Z",
        summary_json: submitted({ docs_deferred: "not-an-array" }),
      }),
      row({
        submitted_at: "2026-09-21T10:00:00Z",
        summary_json: submitted({ docs_deferred: [null, 3, "vehicle_reg"] }),
      }),
    ]);
    expect(s.docs_deferred).toEqual({ vehicle_reg: 1 });
  });
});
