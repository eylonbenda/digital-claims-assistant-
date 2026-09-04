import { describe, it, expect } from "vitest";
import { sanitizeSignals, fallbackTier, TIER_FALLBACK_THRESHOLDS, rankMaxTokens } from "./rank";

describe("sanitizeSignals", () => {
  const ids = new Set(["a", "b"]);

  it("keeps valid signals and normalizes missing flags", () => {
    const out = sanitizeSignals(
      { items: [{ claim_id: "a", tier: "act_now", reason: "משימה באיחור" }] },
      ids,
    );
    expect(out).toEqual([{ claim_id: "a", tier: "act_now", reason: "משימה באיחור", flags: [] }]);
  });

  it("drops unknown ids, bad tiers, and non-object entries", () => {
    const out = sanitizeSignals(
      { items: [
          { claim_id: "zzz", tier: "act_now", reason: "x" },
          { claim_id: "a", tier: "panic", reason: "x" },
          "garbage",
          { claim_id: "b", tier: "ok", reason: "שקט", flags: ["צוין פציעה"] },
        ] },
      ids,
    );
    expect(out).toEqual([{ claim_id: "b", tier: "ok", reason: "שקט", flags: ["צוין פציעה"] }]);
  });

  it("returns [] for a malformed root", () => {
    expect(sanitizeSignals(null, ids)).toEqual([]);
    expect(sanitizeSignals({ nope: true }, ids)).toEqual([]);
  });
});

describe("rankMaxTokens", () => {
  // ~160 output tokens/claim measured worst case; the budget must stay clear of it
  // at every size, because a truncated response can't be cached and so re-runs the
  // call on every dashboard load rather than once a day.
  const MEASURED_WORST_CASE_PER_CLAIM = 160;

  it("keeps headroom over the measured per-claim output at realistic book sizes", () => {
    for (const n of [1, 5, 12, 25, 40]) {
      expect(rankMaxTokens(n)).toBeGreaterThan(n * MEASURED_WORST_CASE_PER_CLAIM);
    }
  });

  it("clamps to a non-streaming-safe ceiling for very large books", () => {
    expect(rankMaxTokens(1000)).toBe(16_000);
  });

  it("grows with the claim count", () => {
    expect(rankMaxTokens(25)).toBeGreaterThan(rankMaxTokens(12));
  });
});

describe("fallbackTier", () => {
  it("maps scores through the thresholds in order", () => {
    const top = TIER_FALLBACK_THRESHOLDS[0];
    expect(fallbackTier(top.min + 1)).toBe(top.tier);
    expect(fallbackTier(0)).toBe("ok");
  });
});
