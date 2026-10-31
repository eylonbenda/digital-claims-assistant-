import { describe, expect, it } from "vitest";
import { CLOSED_LINE } from "./copy";
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
    phone: "0520000000", urgent: false, access_token: "tok", client_plate: null, tp_plates: [],
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

describe("composeDashboard — honest fallback lines (findings #1, #2)", () => {
  it("overdue-but-suppressed task (no queue items, no future task) → waitingLine of the nearest open task, not the empty fallback", () => {
    const d = compose([cl()], q(), null, [{ claim_id: "c1", title: "לוודא דוח שמאי", due_at: daysFromNow(-5) }]);
    const card = d.find((c) => c.claim_id === "c1")!;
    expect(card.action_line).toContain("במעקב:");
    expect(card.action_line).toContain("לוודא דוח שמאי");
    expect(card.action_line).not.toBe("אין פעולות פתוחות");
  });

  it("pre-submission claim with no queue items → pending-client line, even with a null brief", () => {
    const d = compose([cl({ submitted_at: null })], q(), null);
    expect(d[0].action_line).toMatch(/^הלקוח עוד לא התחיל למלא/);
  });
});

describe("composeDashboard — card anatomy", () => {
  it("send is primary; the most-overdue do-task becomes the וגם line", () => {
    const d = compose([cl()], q(
      [sendItem({ doc_labels: ["רישיון נהיגה"], last_sent_at: null })],
      [doItem({ title: "לוודא דוח שמאי", overdue_days: 25 }), doItem({ title: "פתיחת תביעה", overdue_days: 3 })],
    ), null);
    const card = d[0];
    expect(card.send).not.toBeNull();
    expect(card.action_line).toBe("מחכים לרישיון נהיגה מהלקוח · טרם נשלחה תזכורת");
    expect(card.also_line).toBe("וגם: לוודא דוח שמאי (באיחור 25 ימים)");
  });

  it("no send → most-overdue do-task is primary, runner-up is וגם", () => {
    const d = compose([cl()], q([], [
      doItem({ title: "לוודא דוח שמאי", overdue_days: 25 }),
      doItem({ title: "פתיחת תביעה", overdue_days: 3 }),
    ]), null);
    const card = d[0];
    expect(card.send).toBeNull();
    expect(card.action_line).toBe("תורך: לוודא דוח שמאי · באיחור 25 ימים");
    expect(card.also_line).toBe("וגם: פתיחת תביעה (באיחור 3 ימים)");
  });

  it("escalation do-item keeps its own title as the action line, verbatim", () => {
    const title = 'הלקוח לא מגיב על „להשלים מסמכים" (3 תזכורות) — ליצור קשר טלפוני';
    const d = compose([cl()], q([], [doItem({ title, escalation: true, overdue_days: 24 })]), null);
    expect(d[0].action_line).toBe(title);
  });

  it("unclassified with no queue items → classification prompt", () => {
    const d = compose([cl({ claim_type: "unknown", created_at: daysFromNow(-50), submitted_at: daysFromNow(-42) })], q(), null);
    expect(d[0].action_line).toBe("התיק מחכה לסיווג מסלול כבר 42 יום");
  });

  it("waiting card shows the tracked task; single do-task has no וגם line", () => {
    const d = compose([cl()], q(), null, [{ claim_id: "c1", title: "מעקב תשובת מבטח", due_at: daysFromNow(7) }]);
    expect(d[0].action_line).toContain("במעקב: מעקב תשובת מבטח");
    const d2 = compose([cl()], q([], [doItem()]), null);
    expect(d2[0].also_line).toBeNull();
  });
});

describe("composeDashboard — ai_line provenance", () => {
  // A cold day-cache renders the rules-only ordering, where `reason` falls back to
  // the top structured fact. Badging that with 🤖 would credit the model for plain
  // heuristics on every first load of the day.
  it("badges the line only when the item actually came from the model", () => {
    const withAi = compose([cl()], q(), briefWith([{ claim_id: "c1", ai: true, reason: "שיקול מהמודל" }]));
    expect(withAi[0].ai_line).toBe("🤖 שיקול מהמודל");
  });

  it("leaves ai_line null for a rules-only item, even though reason is set", () => {
    const rulesOnly = compose([cl()], q(), briefWith([{ claim_id: "c1", ai: false, reason: "מסלול: צד ג׳ · פתוחה 14 ימים" }]));
    const card = rulesOnly[0];
    expect(card?.ai_line).toBeNull();
  });
});

describe("composeDashboard — flat list", () => {
  // The operator asked for the most recently opened claim first (pilot, 2026-09-13).
  it("orders rows newest-created first", () => {
    const oldQuiet = cl({ id: "old", client_name: "ותיק", created_at: daysFromNow(-40) });
    const newest = cl({ id: "new", client_name: "חדש", created_at: daysFromNow(-1) });
    const middle = cl({ id: "mid", client_name: "אמצע", created_at: daysFromNow(-10) });
    // Give the oldest claim the loudest signal — it must still sort last.
    const d = compose([oldQuiet, newest, middle], q([sendItem({ claim_id: "old" })]), null);
    expect(d.map((c) => c.claim_id)).toEqual(["new", "mid", "old"]);
  });

  it("holds the order regardless of the order claims arrive in", () => {
    const a = cl({ id: "a", created_at: daysFromNow(-3) });
    const b = cl({ id: "b", created_at: daysFromNow(-2) });
    const c = cl({ id: "c", created_at: daysFromNow(-1) });
    expect(compose([a, b, c], q(), null).map((x) => x.claim_id)).toEqual(["c", "b", "a"]);
    expect(compose([c, a, b], q(), null).map((x) => x.claim_id)).toEqual(["c", "b", "a"]);
  });

  it("includes every claim exactly once", () => {
    const claims = [cl({ id: "x" }), cl({ id: "y" }), cl({ id: "z" })];
    const d = compose(claims, q([sendItem({ claim_id: "x" })]), null);
    expect(d).toHaveLength(3);
    expect(new Set(d.map((c) => c.claim_id)).size).toBe(3);
  });

  it("flags needs_action from queue/classification state, never from the brief", () => {
    const pending = cl({ id: "p", submitted_at: null, created_at: daysFromNow(-1) });
    const chase = cl({ id: "s", created_at: daysFromNow(-2) });
    const unclassified = cl({ id: "u", claim_type: "unknown", created_at: daysFromNow(-3) });
    const d = compose([pending, chase, unclassified], q([sendItem({ claim_id: "s" })]), null);
    const by = new Map(d.map((c) => [c.claim_id, c]));
    expect(by.get("s")!.needs_action).toBe(true);
    expect(by.get("u")!.needs_action).toBe(true);
    // Waiting on the client is not the operator's action.
    expect(by.get("p")!.needs_action).toBe(false);
  });

  it("does not let an act_now brief tier flip needs_action on", () => {
    const c = cl({ id: "c1", created_at: daysFromNow(-1) });
    const d = compose([c], q(), briefWith([{ claim_id: "c1", tier: "act_now", score: 99 }]));
    expect(d[0].needs_action).toBe(false);
  });
});

describe("composeDashboard — activity (0930-08)", () => {
  it("orders the flat list by latest activity, not link creation", () => {
    const d = compose(
      [
        cl({ id: "old-link-just-submitted", created_at: daysFromNow(-7), submitted_at: daysFromNow(-0.1) }),
        cl({ id: "new-empty-link", created_at: daysFromNow(-1), submitted_at: null }),
        cl({ id: "late-upload", created_at: daysFromNow(-10), submitted_at: daysFromNow(-8), last_upload_at: daysFromNow(-0.05) }),
      ],
      q(),
      null,
    );
    expect(d.map((c) => c.claim_id)).toEqual(["late-upload", "old-link-just-submitted", "new-empty-link"]);
  });

  it("flags a fresh submission, and a document that arrived after submit", () => {
    const d = compose(
      [
        cl({ id: "s", submitted_at: daysFromNow(-0.2) }),
        cl({ id: "u", submitted_at: daysFromNow(-5), last_upload_at: daysFromNow(-0.1) }),
        cl({ id: "wizard-upload", submitted_at: daysFromNow(-0.5), last_upload_at: daysFromNow(-0.6) }),
        cl({ id: "stale", submitted_at: daysFromNow(-5), last_upload_at: daysFromNow(-3) }),
      ],
      q(),
      null,
    );
    const fresh = Object.fromEntries(d.map((c) => [c.claim_id, c.fresh]));
    expect(fresh).toEqual({ s: "submitted", u: "upload", "wizard-upload": "submitted", stale: null });
  });

  it("counts the classification wait from submission", () => {
    const d = compose(
      [cl({ claim_type: "unknown", created_at: daysFromNow(-5), submitted_at: daysFromNow(-0.1) })],
      q(),
      null,
    );
    expect(d[0].action_line).toBe("התיק מחכה לסיווג מסלול כבר 0 יום");
  });
});

describe("composeDashboard — closed rows, needs_action, passthrough", () => {
  it("includes closed claims, marked closed, with stage closed and CLOSED_LINE", () => {
    const d = compose([cl({ status: "closed" })], q(), null);
    expect(d).toHaveLength(1);
    expect(d[0].closed).toBe(true);
    expect(d[0].stage).toBe("closed");
    expect(d[0].action_line).toBe(CLOSED_LINE);
  });

  it("closed claim with a handling status uses handlingLine, not CLOSED_LINE", () => {
    const d = compose([cl({ status: "closed", handling_effective: "paid" })], q(), null);
    expect(d[0].action_line).toBe("שולמה");
    expect(d[0].stage).toBe("closed");
  });

  it("closed claim never needs_action — even unclassified, rejected, or with a send/do item", () => {
    const d = compose(
      [
        cl({ id: "u", status: "closed", claim_type: "unknown" }),
        cl({ id: "r", status: "abandoned", handling_effective: "rejected" }),
        cl({ id: "s", status: "closed" }),
      ],
      q([sendItem({ claim_id: "s" })], [doItem({ claim_id: "s" })]),
      null,
    );
    for (const row of d) {
      expect(row.needs_action).toBe(false);
      expect(row.send).toBeNull();
      expect(row.also_line).toBeNull();
    }
  });

  it("docs_requested and rejected set needs_action", () => {
    const d = compose(
      [cl({ id: "a", handling_effective: "docs_requested" }), cl({ id: "b", handling_effective: "rejected" })],
      q(), null,
    );
    expect(d.every((r) => r.needs_action)).toBe(true);
  });

  it("appeal and legal alone do not set needs_action", () => {
    const d = compose(
      [cl({ id: "a", handling_effective: "appeal" }), cl({ id: "b", handling_effective: "legal" })],
      q(), null,
    );
    expect(d.some((r) => r.needs_action)).toBe(false);
  });

  it("handling_changed_at counts as activity", () => {
    const changed = daysFromNow(-0.01);
    const d = compose(
      [
        cl({ id: "other", created_at: daysFromNow(-3), submitted_at: daysFromNow(-2) }),
        cl({ id: "changed", created_at: daysFromNow(-20), submitted_at: daysFromNow(-15), handling_changed_at: changed }),
      ],
      q(), null,
    );
    expect(d[0].claim_id).toBe("changed");
    expect(d[0].activity_at).toBe(changed);
  });

  it("carries phone, urgent, access_token, client_plate, tp_plates through", () => {
    const d = compose(
      [cl({ phone: "0501234567", urgent: true, access_token: "abc", client_plate: "12-345-67", tp_plates: ["11-111-11"] })],
      q(), null,
    );
    expect(d[0]).toMatchObject({
      phone: "0501234567", urgent: true, access_token: "abc", client_plate: "12-345-67", tp_plates: ["11-111-11"],
    });
  });
});
