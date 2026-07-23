import { describe, it, expect } from "vitest";
import { sanitizeSignals, fallbackTier, TIER_FALLBACK_THRESHOLDS } from "./rank";

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

describe("fallbackTier", () => {
  it("maps scores through the thresholds in order", () => {
    const top = TIER_FALLBACK_THRESHOLDS[0];
    expect(fallbackTier(top.min + 1)).toBe(top.tier);
    expect(fallbackTier(0)).toBe("ok");
  });
});
