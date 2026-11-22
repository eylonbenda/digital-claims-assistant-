import { describe, expect, it } from "vitest";
import { computeOverview, type OverviewClaim, type OverviewEvent } from "./compute";

const NOW = new Date("2026-11-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let seq = 0;
function claim(over: Partial<OverviewClaim> = {}): OverviewClaim {
  seq += 1;
  return {
    id: `c${seq}`, client_name: `לקוח ${seq}`, status: "in_progress",
    created_at: daysAgo(200), submitted_at: null, closed_at: null,
    handling_effective: null, handling_changed_at: null,
    demand_amount: null, paid_amount: null,
    ...over,
  };
}
const sent = (id: string, n: number): OverviewEvent => ({ claim_id: id, kind: "sent", created_at: daysAgo(n) });
const paid = (id: string, n: number): OverviewEvent => ({ claim_id: id, kind: "paid", created_at: daysAgo(n) });

describe("computeOverview — stages", () => {
  it("counts open claims per stage and leaves closed ones out", () => {
    const o = computeOverview([
      claim(),
      claim({ submitted_at: daysAgo(5) }),
      claim({ submitted_at: daysAgo(9), handling_effective: "sent" }),
      claim({ submitted_at: daysAgo(9), handling_effective: "docs_requested" }),
      claim({ submitted_at: daysAgo(9), handling_effective: "approved_awaiting_payment" }),
      claim({ status: "closed" }),
      claim({ handling_effective: "paid" }),
    ], [], NOW);
    expect(o.stages.with_client.count).toBe(1);
    expect(o.stages.before_send.count).toBe(1);
    expect(o.stages.sent.count).toBe(2);
    expect(o.stages.awaiting_payment.count).toBe(1);
  });

  it("sums only the amounts that are known and says how many that is", () => {
    const o = computeOverview([
      claim({ handling_effective: "sent", demand_amount: 12000 }),
      claim({ handling_effective: "sent", demand_amount: null }),
      claim({ handling_effective: "sent", demand_amount: 0 }),
    ], [], NOW);
    expect(o.stages.sent).toEqual({ count: 3, withAmount: 2, amount: 12000 });
  });
});

describe("computeOverview — waiting on the insurer", () => {
  it("counts only what is still owed after a partial payment", () => {
    const a = claim({ handling_effective: "partial_paid", demand_amount: 13238, paid_amount: 10738 });
    const b = claim({ handling_effective: "sent", demand_amount: 5000 });
    const over = claim({ handling_effective: "partial_paid", demand_amount: 1000, paid_amount: 1500 });
    const o = computeOverview([a, b, over], [sent(a.id, 20), sent(b.id, 3), sent(over.id, 3)], NOW);
    expect(o.waiting.total).toEqual({ count: 3, withAmount: 3, amount: 7500 });
    expect(o.waiting.bands.d15_30.amount).toBe(2500);
    expect(o.stages.awaiting_payment.amount + o.stages.sent.amount).toBe(7500);
    expect(o.waiting.oldest[0]).toMatchObject({ id: a.id, owed_amount: 2500 });
  });

  it("bands by days since the send event, at the edges", () => {
    const cs = [14, 15, 30, 31, 45, 46].map(() => claim({ handling_effective: "sent", demand_amount: 1000 }));
    const o = computeOverview(cs, cs.map((c, i) => sent(c.id, [14, 15, 30, 31, 45, 46][i])), NOW);
    expect(o.waiting.bands.d0_14.count).toBe(1);
    expect(o.waiting.bands.d15_30.count).toBe(2);
    expect(o.waiting.bands.d31_45.count).toBe(2);
    expect(o.waiting.bands.d46_plus).toEqual({ count: 1, withAmount: 1, amount: 1000 });
    expect(o.waiting.total).toEqual({ count: 6, withAmount: 6, amount: 6000 });
  });

  it("uses the latest send event, so a reverted-then-resent claim counts from the resend", () => {
    const c = claim({ handling_effective: "sent" });
    const o = computeOverview([c], [sent(c.id, 40), sent(c.id, 3)], NOW);
    expect(o.waiting.bands.d0_14.count).toBe(1);
  });

  it("falls back to the last handling change, and counts a claim with neither as unknown", () => {
    const legacy = claim({ handling_effective: "sent", handling_changed_at: daysAgo(20) });
    const blind = claim({ handling_effective: "sent" });
    const o = computeOverview([legacy, blind], [], NOW);
    expect(o.waiting.bands.d15_30.count).toBe(1);
    expect(o.waiting.unknownSince).toBe(1);
    expect(o.waiting.total.count).toBe(2);
  });

  it("lists the three longest-waiting claims, longest first", () => {
    const cs = [5, 50, 20, 33].map(() => claim({ handling_effective: "sent" }));
    const o = computeOverview(cs, cs.map((c, i) => sent(c.id, [5, 50, 20, 33][i])), NOW);
    expect(o.waiting.oldest.map((r) => r.days)).toEqual([50, 33, 20]);
  });

  it("ignores claims that are not with the insurer", () => {
    const o = computeOverview([claim(), claim({ submitted_at: daysAgo(3) }), claim({ status: "closed" })], [], NOW);
    expect(o.waiting.total.count).toBe(0);
    expect(o.waiting.oldest).toEqual([]);
  });
});

describe("computeOverview — cycle time", () => {
  it("hides a median that rests on fewer than three claims", () => {
    const cs = [claim({ created_at: daysAgo(10), submitted_at: daysAgo(8) }), claim({ created_at: daysAgo(10), submitted_at: daysAgo(6) })];
    expect(computeOverview(cs, [], NOW).cycle.collect).toEqual({ median: null, n: 2 });
  });

  it("gives the median of each segment once there are three", () => {
    const cs = [2, 4, 9].map((d) => claim({ created_at: daysAgo(30), submitted_at: daysAgo(30 - d) }));
    const ev = cs.flatMap((c, i) => [sent(c.id, 20 - i), paid(c.id, 5)]);
    const o = computeOverview(cs, ev, NOW);
    expect(o.cycle.collect).toEqual({ median: 4, n: 3 });
    expect(o.cycle.prepare.n).toBe(3);
    expect(o.cycle.payment).toEqual({ median: 14, n: 3 });
  });

  it("skips a segment whose ends are out of order or missing", () => {
    const backwards = claim({ created_at: daysAgo(5), submitted_at: daysAgo(9) });
    const o = computeOverview([backwards, claim(), claim()], [paid("nobody", 1)], NOW);
    expect(o.cycle.collect.n).toBe(0);
    expect(o.cycle.payment.n).toBe(0);
  });
});

describe("computeOverview — last 30 days against the 30 before", () => {
  it("splits opened, closed and paid by window, with paid amounts", () => {
    const a = claim({ created_at: daysAgo(3), status: "closed", closed_at: daysAgo(1), handling_effective: "paid", paid_amount: 9000 });
    const b = claim({ created_at: daysAgo(40), status: "closed", closed_at: daysAgo(35), handling_effective: "paid", paid_amount: null });
    const c = claim({ created_at: daysAgo(70) });
    const o = computeOverview([a, b, c], [paid(a.id, 1), paid(b.id, 35)], NOW);
    expect(o.recent.opened).toEqual({ current: 1, previous: 1 });
    expect(o.recent.closed).toEqual({ current: 1, previous: 1 });
    expect(o.recent.paid.current).toEqual({ count: 1, withAmount: 1, amount: 9000 });
    expect(o.recent.paid.previous).toEqual({ count: 1, withAmount: 0, amount: 0 });
  });
});

describe("computeOverview — client collection", () => {
  it("counts links from the last 90 days and how many the client completed", () => {
    const o = computeOverview([
      claim({ created_at: daysAgo(10), submitted_at: daysAgo(9) }),
      claim({ created_at: daysAgo(80) }),
      claim({ created_at: daysAgo(120), submitted_at: daysAgo(119) }),
    ], [], NOW);
    expect(o.collection).toEqual({ links: 2, completed: 1 });
  });
});

describe("computeOverview — degenerate input", () => {
  it("returns zeros for an empty book and survives unparseable dates", () => {
    const empty = computeOverview([], [], NOW);
    expect(empty.waiting.total.count).toBe(0);
    expect(empty.collection).toEqual({ links: 0, completed: 0 });
    const odd = computeOverview([claim({ created_at: "not-a-date", handling_effective: "sent" })], [{ claim_id: "x", kind: "sent", created_at: "nope" }], NOW);
    expect(odd.waiting.unknownSince).toBe(1);
    expect(odd.recent.opened).toEqual({ current: 0, previous: 0 });
  });
});
