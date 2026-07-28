import { describe, it, expect } from "vitest";
import { scoreClaim, SCORE_WEIGHTS, type ScoreInput } from "./score";

const base: ScoreInput = {
  overdueTaskDays: [],
  blockingMissingCount: 0,
  daysSinceSubmit: null,
  daysSinceActivity: null,
  urgent: false,
  unclassified: false,
};

describe("scoreClaim", () => {
  it("scores a quiet claim at 0", () => {
    expect(scoreClaim(base)).toBe(0);
  });

  it("each overdue task adds base + per-day, capped", () => {
    const one = scoreClaim({ ...base, overdueTaskDays: [2] });
    expect(one).toBe(
      SCORE_WEIGHTS.overdueTaskBase + 2 * SCORE_WEIGHTS.overdueTaskPerDay,
    );
    const capped = scoreClaim({ ...base, overdueTaskDays: [100] });
    expect(capped).toBe(
      SCORE_WEIGHTS.overdueTaskBase +
        SCORE_WEIGHTS.overdueTaskDayCap * SCORE_WEIGHTS.overdueTaskPerDay,
    );
  });

  it("blocking docs scale with days since submit, capped", () => {
    const s = scoreClaim({ ...base, blockingMissingCount: 2, daysSinceSubmit: 3 });
    expect(s).toBe(2 * (SCORE_WEIGHTS.blockingItemBase + 3 * SCORE_WEIGHTS.blockingPerDaySinceSubmit));
    const capped = scoreClaim({ ...base, blockingMissingCount: 1, daysSinceSubmit: 100 });
    expect(capped).toBe(
      SCORE_WEIGHTS.blockingItemBase +
        SCORE_WEIGHTS.blockingDayCap * SCORE_WEIGHTS.blockingPerDaySinceSubmit,
    );
  });

  it("staleness contributes per day, capped", () => {
    expect(scoreClaim({ ...base, daysSinceActivity: 4 })).toBe(4 * SCORE_WEIGHTS.stalePerDay);
    expect(scoreClaim({ ...base, daysSinceActivity: 100 })).toBe(
      SCORE_WEIGHTS.staleDayCap * SCORE_WEIGHTS.stalePerDay,
    );
  });

  it("urgent and unclassified add fixed boosts", () => {
    expect(scoreClaim({ ...base, urgent: true })).toBe(SCORE_WEIGHTS.urgent);
    expect(scoreClaim({ ...base, unclassified: true })).toBe(SCORE_WEIGHTS.unclassified);
  });

  it("signals are additive", () => {
    const s = scoreClaim({
      ...base,
      overdueTaskDays: [1],
      urgent: true,
    });
    expect(s).toBe(
      SCORE_WEIGHTS.overdueTaskBase + SCORE_WEIGHTS.overdueTaskPerDay + SCORE_WEIGHTS.urgent,
    );
  });
});
