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
    access_token: "tok1", blocking_labels: ["רישיון נהיגה"], missing_doc_labels: [],
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

  it("renders the generic fallback line with no bullets when blocking labels are empty", () => {
    const q = build([claim({ blocking_labels: [] })], [task()]);
    expect(q.send).toHaveLength(1);
    expect(q.send[0].body).not.toContain("•");
    expect(q.send[0].body).toContain("עדיין חסרים לנו מסמכים");
  });

  it("collect_private_report_docs draws its body from missing_doc_labels, not blocking_labels (spec §2)", () => {
    const q = build(
      [claim({ blocking_labels: ["מכתב דרישה"], missing_doc_labels: ["קבלה על תשלום"] })],
      [task({ key: "collect_private_report_docs", title: 'לאסוף מסמכי "דוח פרטי"', due_at: daysAgo(1) })],
    );
    expect(q.send).toHaveLength(1);
    expect(q.send[0].body).toContain("• קבלה על תשלום");
    expect(q.send[0].body).not.toContain("מכתב דרישה");
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

describe("buildQueue — one message per claim per day", () => {
  const twoDue = (over1 = {}, over2 = {}) => [
    task({ id: "t1", key: "chase_missing_docs", due_at: daysAgo(2), ...over1 }),
    task({ id: "t2", key: "get_tp_insurer", title: "להשיג פרטי מבטח צד ג'", due_at: daysAgo(2), ...over2 }),
  ];

  it("two due send rules on one claim → only one item; larger overdue wins", () => {
    const q = build([claim()], twoDue({}, { due_at: daysAgo(5) }));
    expect(q.send).toHaveLength(1);
    expect(q.send[0].task_key).toBe("get_tp_insurer");
  });

  it("equal overdue → RULE_PRIORITY order wins", () => {
    const q = build([claim()], twoDue());
    expect(q.send).toHaveLength(1);
    expect(q.send[0].task_key).toBe("chase_missing_docs");
  });

  it("an event earlier TODAY on any key blocks all sends for the claim", () => {
    // Sent at 06:00Z today (NOW is 08:00Z); the other rule has no events at all.
    const q = build([claim()], twoDue(), [
      ev({ task_key: "chase_missing_docs", created_at: "2026-08-10T06:00:00Z" }),
    ]);
    expect(q.send).toHaveLength(0);
  });

  it("the cap is per claim — a second claim still gets its item", () => {
    const q = build(
      [claim(), claim({ claim_id: "c2", access_token: "tok2" })],
      [...twoDue(), task({ id: "t3", claim_id: "c2", due_at: daysAgo(1) })],
      [ev({ created_at: "2026-08-10T06:00:00Z" })],
    );
    expect(q.send.map((s) => s.claim_id)).toEqual(["c2"]);
  });
});

describe("buildQueue — give-up escalation", () => {
  const threeSends = [ev({ created_at: daysAgo(12) }), ev({ created_at: daysAgo(8) }), ev({ created_at: daysAgo(4) })];

  it("3 sends with no upload since → escalation row, no send item", () => {
    const q = build([claim()], [task()], threeSends);
    expect(q.send).toHaveLength(0);
    expect(q.doToday).toEqual([
      expect.objectContaining({ escalation: true, title: expect.stringContaining("ליצור קשר טלפוני") }),
    ]);
  });

  it("escalation title carries the task's own subject, so two escalations on one claim are distinguishable", () => {
    const q = build([claim()], [task({ title: "להשלים מסמכים חסרים מהלקוח" })], threeSends);
    expect(q.doToday[0].title).toContain("להשלים מסמכים חסרים מהלקוח");
    expect(q.doToday[0].title).toContain("ליצור קשר טלפוני");
  });

  it("a document upload after the sends resets the counter", () => {
    const q = build([claim({ last_doc_uploaded_at: daysAgo(3.5) })], [task()], threeSends);
    // 0 sends since the upload; last touch was 4d ago > 3d cooldown → proposes.
    expect(q.send).toHaveLength(1);
    expect(q.doToday).toHaveLength(0);
  });

  it("skips don't count toward the give-up threshold", () => {
    const skips = threeSends.map((e) => ({ ...e, kind: "skipped" as const }));
    const q = build([claim()], [task()], skips);
    expect(q.send).toHaveLength(1); // last skip 4d ago, outside cooldown
  });
});

describe("buildQueue — ordering", () => {
  it("send lane: brief tier first, then score desc, then overdue desc", () => {
    const claims = [
      claim({ claim_id: "a", access_token: "ta", tier: "waiting", score: 90 }),
      claim({ claim_id: "b", access_token: "tb", tier: "act_now", score: 10 }),
      claim({ claim_id: "c", access_token: "tc", tier: "act_now", score: 50 }),
      claim({ claim_id: "d", access_token: "td", tier: null, score: 99 }),
    ];
    const tasks = claims.map((c, i) => task({ id: `t${i}`, claim_id: c.claim_id, due_at: daysAgo(1) }));
    const q = build(claims, tasks);
    expect(q.send.map((s) => s.claim_id)).toEqual(["c", "b", "a", "d"]);
  });

  it("doToday: overdue desc", () => {
    const q = build(
      [claim()],
      [
        task({ id: "t1", key: "open_claim_with_insurer", title: "א", due_at: daysAgo(1) }),
        task({ id: "t2", key: "follow_up_insurer", title: "ב", due_at: daysAgo(6) }),
      ],
    );
    expect(q.doToday.map((d) => d.title)).toEqual(["ב", "א"]);
  });
});

describe("buildQueue — SendItem presentation fields", () => {
  it("carries the chaseable labels as doc_labels", () => {
    const q = build([claim({ blocking_labels: ["רישיון נהיגה", "תמונות נזק"] })], [task()]);
    expect(q.send[0].doc_labels).toEqual(["רישיון נהיגה", "תמונות נזק"]);
  });

  it("collect_private_report_docs: doc_labels is missing_doc_labels, not blocking_labels (finding #3)", () => {
    const q = build(
      [claim({ blocking_labels: ["מכתב דרישה"], missing_doc_labels: ["קבלה על תשלום"] })],
      [task({ key: "collect_private_report_docs", title: 'לאסוף מסמכי "דוח פרטי"', due_at: daysAgo(1) })],
    );
    expect(q.send[0].doc_labels).toEqual(["קבלה על תשלום"]);
  });

  it("get_tp_insurer: doc_labels is empty — nothing is being chased by document name", () => {
    const q = build(
      [claim({ blocking_labels: ["רישיון נהיגה"] })],
      [task({ key: "get_tp_insurer", title: "להשיג פרטי מבטח צד ג'", due_at: daysAgo(1) })],
    );
    expect(q.send[0].doc_labels).toEqual([]);
  });

  it("last_sent_at is the newest 'sent' event, ignoring skips", () => {
    const q = build([claim()], [task()], [
      ev({ kind: "sent", created_at: daysAgo(10) }),
      ev({ kind: "sent", created_at: daysAgo(5) }),
      ev({ kind: "skipped", created_at: daysAgo(4) }),
    ]);
    // last touch 4d ago (skip) > 3d cooldown → still proposed; last SENT is 5d ago
    expect(q.send).toHaveLength(1);
    expect(q.send[0].last_sent_at).toBe(daysAgo(5));
  });

  it("last_sent_at is null when nothing was ever sent", () => {
    const q = build([claim()], [task()]);
    expect(q.send[0].last_sent_at).toBeNull();
  });
});
