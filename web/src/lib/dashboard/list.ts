import type { ClaimRow } from "./compose";
import { STAGE_ORDER, type Stage } from "./stage";

export type StageFilter = "all" | "needs_you" | Stage;

const VALID: ReadonlySet<string> = new Set<string>(["all", "needs_you", ...STAGE_ORDER]);
const MIN_DIGITS = 3;

export function parseStageFilter(raw: string | string[] | undefined): StageFilter {
  return typeof raw === "string" && VALID.has(raw) ? (raw as StageFilter) : "all";
}

export const normalizeDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

export function matchesQuery(
  row: Pick<ClaimRow, "client_name" | "phone" | "client_plate" | "tp_plates">,
  q: string,
): boolean {
  const t = q.trim();
  if (!t) return true;
  if ((row.client_name ?? "").includes(t)) return true;
  const digits = normalizeDigits(t);
  if (digits.length < MIN_DIGITS) return false;
  return [row.phone, row.client_plate, ...row.tp_plates].some((v) => normalizeDigits(v).includes(digits));
}

const byActivity = (a: ClaimRow, b: ClaimRow) => b.activity_at.localeCompare(a.activity_at);

export function visibleRows(rows: ClaimRow[], filter: StageFilter, q: string): ClaimRow[] {
  const searching = q.trim() !== "";
  const out = rows.filter((r) => {
    const inFilter =
      filter === "all" ? !r.closed || searching
      : filter === "needs_you" ? r.needs_action && !r.closed
      : r.stage === filter;
    return inFilter && matchesQuery(r, q);
  });
  return out.sort(
    filter === "needs_you" ? (a, b) => b.overdue_days - a.overdue_days || byActivity(a, b) : byActivity,
  );
}

export function chipCounts(rows: ClaimRow[], q: string): Record<Exclude<StageFilter, "closed">, number> {
  const counts: Record<Exclude<StageFilter, "closed">, number> = {
    all: 0, needs_you: 0, with_client: 0, before_send: 0, sent: 0, awaiting_payment: 0,
  };
  const searching = q.trim() !== "";
  for (const r of rows) {
    if (!matchesQuery(r, q)) continue;
    if (!r.closed || searching) counts.all++;
    if (r.needs_action && !r.closed) counts.needs_you++;
    if (r.stage !== "closed") counts[r.stage]++;
  }
  return counts;
}
