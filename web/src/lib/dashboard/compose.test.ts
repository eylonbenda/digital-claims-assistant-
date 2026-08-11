import { describe, expect, it } from "vitest";
import { composeDashboard, type ComposeClaim, type OpenTaskLite } from "./compose";
import type { Brief } from "@/lib/brief/brief";
import type { OutboundQueue, SendItem, DoItem } from "@/lib/outbound/queue";

const NOW = new Date("2026-08-11T06:00:00Z");
const DAY_MS = 86_400_000;
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY_MS).toISOString();

function cl(over: Partial<ComposeClaim> = {}): ComposeClaim {
  return {
    id: "c1", client_name: "דנה כהן", claim_type: "third_party_report",
    status: "form_generated", submitted_at: daysFromNow(-20), created_at: daysFromNow(-25),
    ...over,
  };
}
function sendItem(over: Partial<SendItem> = {}): SendItem {
  return {
    claim_id: "c1", task_id: "t1", task_key: "chase_missing_docs",
    client_name: "דנה כהן", tier: "act_now", reason: "סיבה", overdue_days: 5,
    body: "שלום…", href: "https://wa.me/972520000000?text=x",
    doc_labels: ["רישיון נהיגה"], last_sent_at: null,
    ...over,
  };
}
function doItem(over: Partial<DoItem> = {}): DoItem {
  return {
    claim_id: "c1", client_name: "דנה כהן", title: "פתיחת תביעה מול מבטח הלקוח",
    due_at: daysFromNow(-3), overdue_days: 3, escalation: false,
    ...over,
  };
}
const q = (send: SendItem[] = [], doToday: DoItem[] = []): OutboundQueue => ({ send, doToday });
const briefWith = (items: Array<Partial<Brief["items"][number]> & { claim_id: string }>): Brief => ({
  brief_date: "2026-08-11", generated_at: NOW.toISOString(), ai: true,
  items: items.map((i) => ({
    client_name: null, client_phone: null, access_token: "tok", status: "submitted",
    claim_type: "third_party_report", tier: "waiting" as const, reason: "", flags: [],
    score: 0, ai: true, blocking_labels: [], next_task: null, ...i,
  })),
});
const compose = (
  claims: ComposeClaim[], queue: OutboundQueue | null, brief: Brief | null, openTasks: OpenTaskLite[] = [],
) => composeDashboard({ claims, queue, brief, openTasks, now: NOW });

describe("composeDashboard — sections", () => {
  it("a claim with a send item today → attention", () => {
    const d = compose([cl()], q([sendItem()]), null);
    expect(d.attention.map((c) => c.claim_id)).toEqual(["c1"]);
    expect(d.waiting).toHaveLength(0);
  });

  it("a claim with only a do item → attention", () => {
    const d = compose([cl()], q([], [doItem()]), null);
    expect(d.attention.map((c) => c.claim_id)).toEqual(["c1"]);
  });

  it("submitted-but-unclassified → attention even with no queue items", () => {
    const d = compose([cl({ claim_type: "unknown" })], q(), null);
    expect(d.attention.map((c) => c.claim_id)).toEqual(["c1"]);
  });

  it("tier act_now → attention even with no queue items", () => {
    const d = compose([cl()], q(), briefWith([{ claim_id: "c1", tier: "act_now" }]));
    expect(d.attention.map((c) => c.claim_id)).toEqual(["c1"]);
  });

  it("no action today + open future-dated task → waiting", () => {
    const d = compose([cl()], q(), null, [{ claim_id: "c1", title: "מעקב תשובת מבטח", due_at: daysFromNow(7) }]);
    expect(d.waiting.map((c) => c.claim_id)).toEqual(["c1"]);
    expect(d.attention).toHaveLength(0);
  });

  it("no action + tier this_week or waiting → waiting; everything else → ok", () => {
    const claims = [cl({ id: "a" }), cl({ id: "b" }), cl({ id: "c" })];
    const brief = briefWith([
      { claim_id: "a", tier: "this_week" }, { claim_id: "b", tier: "waiting" }, { claim_id: "c", tier: "ok" },
    ]);
    const d = compose(claims, q(), brief);
    expect(d.waiting.map((c) => c.claim_id).sort()).toEqual(["a", "b"]);
    expect(d.ok.map((c) => c.claim_id)).toEqual(["c"]);
  });

  it("null queue AND null brief still compute (deterministic degrade)", () => {
    const d = compose(
      [cl({ id: "a", claim_type: "unknown" }), cl({ id: "b" })],
      null, null,
      [{ claim_id: "b", title: "מעקב", due_at: daysFromNow(3) }],
    );
    expect(d.attention.map((c) => c.claim_id)).toEqual(["a"]); // unclassified
    expect(d.waiting.map((c) => c.claim_id)).toEqual(["b"]);   // future task
  });
});

describe("composeDashboard — ordering", () => {
  it("attention: tier order, then score desc", () => {
    const claims = [cl({ id: "a" }), cl({ id: "b" }), cl({ id: "c" })];
    const brief = briefWith([
      { claim_id: "a", tier: "this_week", score: 90 },
      { claim_id: "b", tier: "act_now", score: 10 },
      { claim_id: "c", tier: "act_now", score: 50 },
    ]);
    const d = compose(claims, q(
      [sendItem({ claim_id: "a" }), sendItem({ claim_id: "b" }), sendItem({ claim_id: "c" })],
    ), brief);
    expect(d.attention.map((x) => x.claim_id)).toEqual(["c", "b", "a"]);
  });

  it("waiting: nearest due date first", () => {
    const claims = [cl({ id: "a" }), cl({ id: "b" })];
    const d = compose(claims, q(), null, [
      { claim_id: "a", title: "רחוק", due_at: daysFromNow(14) },
      { claim_id: "b", title: "קרוב", due_at: daysFromNow(2) },
    ]);
    expect(d.waiting.map((x) => x.claim_id)).toEqual(["b", "a"]);
  });
});
