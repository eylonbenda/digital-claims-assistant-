// When each milestone (car_at_garage, submitted_to_insurer, payment_received, …) was
// ticked. claims.checklist_state only holds booleans; the dates live in claim_events
// as `milestone_ticked` rows ({ key, done }), written by PATCH /api/claims/[id]/checklist
// since 2026-10-09. Ticks made before then have no event, so they have no date.

export const MILESTONE_EVENT = "milestone_ticked";

export type MilestoneEvent = {
  type: string;
  payload_json: unknown;
  created_at: string;
};

// key → ISO time of the tick currently in effect. An un-tick clears the key; a later
// re-tick dates from the re-tick. Events may arrive in any order.
export function milestoneDates(events: MilestoneEvent[]): Record<string, string> {
  const dates: Record<string, string> = {};
  const ordered = events
    .filter((e) => e.type === MILESTONE_EVENT)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const e of ordered) {
    const p = e.payload_json as { key?: unknown; done?: unknown } | null;
    if (typeof p?.key !== "string" || typeof p.done !== "boolean") continue;
    if (p.done) dates[p.key] = e.created_at;
    else delete dates[p.key];
  }
  return dates;
}
