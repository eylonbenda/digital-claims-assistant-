import { describe, expect, it } from "vitest";
import {
  buildQueue,
  type OutboundEventRow,
  type QueueClaim,
  type QueueTaskRow,
} from "./queue";

const NOW = new Date("2026-08-10T08:00:00Z");
const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

function claim(over: Partial<QueueClaim> = {}): QueueClaim {
  return {
    claim_id: "c1", client_name: "דנה כהן", client_phone: "0521234567",
    access_token: "tok1", blocking_labels: ["רישיון נהיגה"],
    last_doc_uploaded_at: null, tier: null, reason: null, score: 0,
    ...over,
  };
}
function task(over: Partial<QueueTaskRow> = {}): QueueTaskRow {
  return {
    id: "t1", claim_id: "c1", key: "chase_missing_docs",
    title: "להשלים מסמכים חסרים מהלקוח",
    due_at: daysAgo(1), status: "todo", source: "template",
    ...over,
  };
}
function ev(over: Partial<OutboundEventRow> = {}): OutboundEventRow {
  return { claim_id: "c1", task_key: "chase_missing_docs", kind: "sent", created_at: daysAgo(1), ...over };
}
const build = (claims: QueueClaim[], tasks: QueueTaskRow[], events: OutboundEventRow[] = []) =>
  buildQueue({ claims, tasks, events, origin: "https://app.test", now: NOW });

describe("buildQueue — lanes and eligibility", () => {
  it("puts a due send-rule task in the send lane with rendered body and wa href", () => {
    const q = build([claim()], [task()]);
    expect(q.send).toHaveLength(1);
    expect(q.doToday).toHaveLength(0);
    const item = q.send[0];
    expect(item.task_key).toBe("chase_missing_docs");
    expect(item.overdue_days).toBe(1);
    expect(item.body).toContain("שלום דנה");
    expect(item.body).toContain("• רישיון נהיגה");
    expect(item.body).toContain("https://app.test/c/tok1");
    expect(item.href).toContain("https://wa.me/972521234567?text=");
  });

  it("excludes tasks not yet due", () => {
    const q = build([claim()], [task({ due_at: daysAgo(-2) })]); // due in 2 days
    expect(q.send).toHaveLength(0);
    expect(q.doToday).toHaveLength(0);
  });

  it("puts due non-send template tasks in doToday", () => {
    const q = build([claim()], [task({ key: "open_claim_with_insurer", title: "פתיחת תביעה מול מבטח הלקוח", due_at: daysAgo(3) })]);
    expect(q.send).toHaveLength(0);
    expect(q.doToday).toEqual([
      expect.objectContaining({ title: "פתיחת תביעה מול מבטח הלקוח", overdue_days: 3, escalation: false }),
    ]);
  });

  it("ignores manual tasks, done tasks, and tasks with no due date", () => {
    const q = build(
      [claim()],
      [
        task({ id: "m1", key: null, source: "manual" }),
        task({ id: "d1", status: "done" }),
        task({ id: "n1", key: "open_claim_with_insurer", due_at: null }),
      ],
    );
    expect(q.send).toHaveLength(0);
    expect(q.doToday).toHaveLength(0);
  });

  it("keeps the send item but nulls href when the phone is missing", () => {
    const q = build([claim({ client_phone: null })], [task()]);
    expect(q.send).toHaveLength(1);
    expect(q.send[0].href).toBeNull();
  });
});

describe("buildQueue — cooldown", () => {
  it("suppresses a rule inside its cooldown window (sent 1d ago, cooldown 3d)", () => {
    const q = build([claim()], [task()], [ev({ created_at: daysAgo(1) })]);
    expect(q.send).toHaveLength(0);
  });

  it("proposes again once the cooldown has passed (sent 4d ago)", () => {
    const q = build([claim()], [task()], [ev({ created_at: daysAgo(4) })]);
    expect(q.send).toHaveLength(1);
  });

  it("a skip suppresses exactly like a send", () => {
    const q = build([claim()], [task()], [ev({ kind: "skipped", created_at: daysAgo(1) })]);
    expect(q.send).toHaveLength(0);
  });

  it("cooldown is per (claim, task_key) — another claim's events don't suppress", () => {
    const q = build(
      [claim(), claim({ claim_id: "c2", access_token: "tok2" })],
      [task(), task({ id: "t2", claim_id: "c2" })],
      [ev({ claim_id: "c2", created_at: daysAgo(1) })],
    );
    expect(q.send.map((s) => s.claim_id)).toEqual(["c1"]);
  });
});
