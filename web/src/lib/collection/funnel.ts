import { STEPS, stepIndex, type StepKey } from "@/components/collection/steps";

// Wizard funnel: of the links that went out, how many claimants finished, and where
// the rest stopped.
//
// Why this exists: C1 in docs/assumptions-canvas.md is only partly validated — real
// clients demonstrably complete the wizard unaided, but the abandonment rate has
// never been measured, so "50+ claims arrived" has no denominator. That gap became
// urgent when the licence and vehicle-registration uploads were made required
// (2026-09-27): tightening a funnel you cannot see is how a change silently costs
// claims. It also answers C2 — whether clients can actually photograph their
// documents — from the deferral counts rather than from opinion.
//
// Pure: takes rows, returns numbers. No I/O, so it is unit-testable and the caller
// owns the query.

export type FunnelRow = {
  id: string;
  created_at: string;
  submitted_at: string | null;
  // summary_json.funnel (submitted) or summary_json.draft (in flight). Untrusted
  // shape — it is whatever an older deploy happened to write.
  summary_json: unknown;
};

export type FunnelSummary = {
  links_sent: number;
  submitted: number;
  /** Claims that never reached submit. */
  abandoned: number;
  /** submitted / links_sent, 0-1, rounded to 3dp. 0 when nothing was sent. */
  completion_rate: number;
  /** Abandoned claims that never saved a single draft — the link was likely never opened. */
  never_started: number;
  /** Furthest step reached, counted over abandoned claims that did start. */
  abandoned_at: Array<{ step: StepKey; count: number }>;
  /** Of submitted claims, how many deferred each required document. */
  docs_deferred: Record<string, number>;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

// The furthest step this claimant reached, or null when they never saved a draft.
// Prefers the monotonic max_step_key, falling back to step_key for rows written
// before max_step_key existed.
export function furthestStep(summaryJson: unknown): StepKey | null {
  const summary = asRecord(summaryJson);
  const funnel = asRecord(summary.funnel);
  const draft = asRecord(summary.draft);
  for (const candidate of [funnel.max_step_key, draft.max_step_key, draft.step_key]) {
    if (stepIndex(candidate) >= 0) return candidate as StepKey;
  }
  return null;
}

export function summarizeFunnel(rows: FunnelRow[]): FunnelSummary {
  const submittedRows = rows.filter((r) => !!r.submitted_at);
  const abandonedRows = rows.filter((r) => !r.submitted_at);

  const atCounts = new Map<StepKey, number>();
  let neverStarted = 0;
  for (const r of abandonedRows) {
    const step = furthestStep(r.summary_json);
    if (!step) {
      neverStarted += 1;
      continue;
    }
    atCounts.set(step, (atCounts.get(step) ?? 0) + 1);
  }

  const docsDeferred: Record<string, number> = {};
  for (const r of submittedRows) {
    const funnel = asRecord(asRecord(r.summary_json).funnel);
    const list = Array.isArray(funnel.docs_deferred) ? funnel.docs_deferred : [];
    for (const t of list) {
      if (typeof t === "string") docsDeferred[t] = (docsDeferred[t] ?? 0) + 1;
    }
  }

  return {
    links_sent: rows.length,
    submitted: submittedRows.length,
    abandoned: abandonedRows.length,
    completion_rate:
      rows.length === 0 ? 0 : Math.round((submittedRows.length / rows.length) * 1000) / 1000,
    never_started: neverStarted,
    // Flow order, not count order — reading a funnel means reading it in sequence.
    abandoned_at: STEPS.map((s) => s.key)
      .filter((k) => atCounts.has(k))
      .map((step) => ({ step, count: atCounts.get(step)! })),
    docs_deferred: docsDeferred,
  };
}
