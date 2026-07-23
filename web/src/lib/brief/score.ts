// Deterministic priority score — hard signals only. The LLM never touches this;
// it owns the fine ordering and the full fallback when AI is unavailable.
// Weights are FIELD ASSUMPTIONS — tune with the design partner.
export const SCORE_WEIGHTS = {
  overdueTaskBase: 25,
  overdueTaskPerDay: 5,
  overdueTaskDayCap: 10,
  blockingItemBase: 12,
  blockingPerDaySinceSubmit: 1,
  blockingDayCap: 14,
  stalePerDay: 3,
  staleDayCap: 10,
  urgent: 40,
  unclassified: 15,
} as const;

export type ScoreInput = {
  overdueTaskDays: number[];
  blockingMissingCount: number;
  daysSinceSubmit: number | null;
  daysSinceActivity: number | null;
  urgent: boolean;
  unclassified: boolean;
};

export function scoreClaim(s: ScoreInput): number {
  const W = SCORE_WEIGHTS;
  let score = 0;
  for (const days of s.overdueTaskDays) {
    score += W.overdueTaskBase + Math.min(days, W.overdueTaskDayCap) * W.overdueTaskPerDay;
  }
  if (s.blockingMissingCount > 0) {
    const days = Math.min(s.daysSinceSubmit ?? 0, W.blockingDayCap);
    score += s.blockingMissingCount * (W.blockingItemBase + days * W.blockingPerDaySinceSubmit);
  }
  if (s.daysSinceActivity !== null) {
    score += Math.min(s.daysSinceActivity, W.staleDayCap) * W.stalePerDay;
  }
  if (s.urgent) score += W.urgent;
  if (s.unclassified) score += W.unclassified;
  return score;
}
