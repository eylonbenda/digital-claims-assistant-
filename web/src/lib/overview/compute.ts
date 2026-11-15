// Pure aggregation behind /dashboard/overview. No I/O, no clock reads — the page
// loads the rows and passes `now`.
import { claimStage, type Stage } from "@/lib/dashboard/stage";

const DAY_MS = 86_400_000;

// A median over fewer claims than this says more about one claim than about the
// business — the page shows "not enough data" instead.
export const MIN_SAMPLE = 3;
export const WINDOW_DAYS = 30;
export const COLLECTION_WINDOW_DAYS = 90;
export const OLDEST_SHOWN = 3;

export type OpenStage = Exclude<Stage, "closed">;
export const OPEN_STAGES: OpenStage[] = ["with_client", "before_send", "sent", "awaiting_payment"];

export type OverviewClaim = {
  id: string;
  client_name: string | null;
  status: string;
  created_at: string;
  submitted_at: string | null;
  closed_at: string | null;
  // effectiveHandling() — the column, or the legacy milestone.
  handling_effective: string | null;
  handling_changed_at: string | null;
  demand_amount: number | null;
  paid_amount: number | null;
};

// claim_events rows the page narrows to: when a claim was sent, and when it was paid.
export type OverviewEvent = { claim_id: string; kind: "sent" | "paid"; created_at: string };

// A sum that says how much of it is known: `amount` covers `withAmount` of `count` claims.
export type Money = { count: number; withAmount: number; amount: number };
export type Stat = { median: number | null; n: number };

export type WaitingBand = "d0_14" | "d15_30" | "d31_45" | "d46_plus";
export const WAITING_BANDS: WaitingBand[] = ["d0_14", "d15_30", "d31_45", "d46_plus"];

export type Overview = {
  stages: Record<OpenStage, Money>;
  waiting: {
    total: Money;
    bands: Record<WaitingBand, Money>;
    // Longest-waiting first. `days` is null when nothing records when it was sent.
    oldest: { id: string; client_name: string | null; days: number; demand_amount: number | null }[];
    unknownSince: number;
  };
  cycle: { collect: Stat; prepare: Stat; payment: Stat };
  recent: {
    opened: { current: number; previous: number };
    closed: { current: number; previous: number };
    paid: { current: Money; previous: Money };
  };
  collection: { links: number; completed: number };
};

const emptyMoney = (): Money => ({ count: 0, withAmount: 0, amount: 0 });

function add(m: Money, amount: number | null): void {
  m.count += 1;
  if (amount !== null) {
    m.withAmount += 1;
    m.amount += amount;
  }
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

function stat(days: number[]): Stat {
  if (days.length < MIN_SAMPLE) return { median: null, n: days.length };
  const s = [...days].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { median: Math.round(median), n: s.length };
}

function band(days: number): WaitingBand {
  if (days <= 14) return "d0_14";
  if (days <= 30) return "d15_30";
  if (days <= 45) return "d31_45";
  return "d46_plus";
}

export function computeOverview(claims: OverviewClaim[], events: OverviewEvent[], now: Date): Overview {
  const nowMs = now.getTime();

  // Latest event of each kind per claim — a reverted-then-resent claim counts from the resend.
  const sentAt = new Map<string, number>();
  const paidAt = new Map<string, number>();
  for (const e of events) {
    const t = ms(e.created_at);
    if (t === null) continue;
    const map = e.kind === "sent" ? sentAt : paidAt;
    if ((map.get(e.claim_id) ?? -Infinity) < t) map.set(e.claim_id, t);
  }

  const stages = Object.fromEntries(OPEN_STAGES.map((s) => [s, emptyMoney()])) as Record<OpenStage, Money>;
  const bands = Object.fromEntries(WAITING_BANDS.map((b) => [b, emptyMoney()])) as Record<WaitingBand, Money>;
  const waitingTotal = emptyMoney();
  const waitingRows: Overview["waiting"]["oldest"] = [];
  let unknownSince = 0;

  const collect: number[] = [];
  const prepare: number[] = [];
  const payment: number[] = [];

  const inWindow = (t: number | null, from: number, to: number) => t !== null && t > from && t <= to;
  const cur = nowMs - WINDOW_DAYS * DAY_MS;
  const prev = cur - WINDOW_DAYS * DAY_MS;
  const recent: Overview["recent"] = {
    opened: { current: 0, previous: 0 },
    closed: { current: 0, previous: 0 },
    paid: { current: emptyMoney(), previous: emptyMoney() },
  };

  const collectionFrom = nowMs - COLLECTION_WINDOW_DAYS * DAY_MS;
  const collection = { links: 0, completed: 0 };

  for (const c of claims) {
    const created = ms(c.created_at);
    const submitted = ms(c.submitted_at);
    const sent = sentAt.get(c.id) ?? null;
    const paid = paidAt.get(c.id) ?? null;
    const stage = claimStage({
      status: c.status, submitted_at: c.submitted_at, handling_effective: c.handling_effective,
    });

    if (stage !== "closed") {
      add(stages[stage], c.demand_amount);
      if (stage === "sent" || stage === "awaiting_payment") {
        add(waitingTotal, c.demand_amount);
        // No send event on legacy claims (sent by ticking the milestone): fall back
        // to the last handling change, which is at or after the send.
        const since = sent ?? ms(c.handling_changed_at);
        if (since === null) unknownSince += 1;
        else {
          const days = Math.max(0, Math.floor((nowMs - since) / DAY_MS));
          add(bands[band(days)], c.demand_amount);
          waitingRows.push({ id: c.id, client_name: c.client_name, days, demand_amount: c.demand_amount });
        }
      }
    }

    // Cycle segments — each needs both ends recorded and in order.
    const span = (a: number | null, b: number | null) =>
      a !== null && b !== null && b >= a ? (b - a) / DAY_MS : null;
    const d1 = span(created, submitted);
    const d2 = span(submitted, sent);
    const d3 = span(sent, paid);
    if (d1 !== null) collect.push(d1);
    if (d2 !== null) prepare.push(d2);
    if (d3 !== null) payment.push(d3);

    if (inWindow(created, cur, nowMs)) recent.opened.current += 1;
    else if (inWindow(created, prev, cur)) recent.opened.previous += 1;

    const closed = ms(c.closed_at);
    if (inWindow(closed, cur, nowMs)) recent.closed.current += 1;
    else if (inWindow(closed, prev, cur)) recent.closed.previous += 1;

    if (inWindow(paid, cur, nowMs)) add(recent.paid.current, c.paid_amount);
    else if (inWindow(paid, prev, cur)) add(recent.paid.previous, c.paid_amount);

    // Abandoned links are part of the denominator — that is the point of the rate.
    if (created !== null && created > collectionFrom) {
      collection.links += 1;
      if (submitted !== null) collection.completed += 1;
    }
  }

  waitingRows.sort((a, b) => b.days - a.days);

  return {
    stages,
    waiting: { total: waitingTotal, bands, oldest: waitingRows.slice(0, OLDEST_SHOWN), unknownSince },
    cycle: { collect: stat(collect), prepare: stat(prepare), payment: stat(payment) },
    recent,
    collection,
  };
}
