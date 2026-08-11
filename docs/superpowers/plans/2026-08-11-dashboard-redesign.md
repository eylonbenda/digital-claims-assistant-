# Dashboard Redesign ("מקשה אחת") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's three stacked surfaces (queue panel, morning brief, claims table) with one sectioned list — every claim appears exactly once, carrying its own next action — per spec `docs/superpowers/specs/2026-08-11-dashboard-redesign-design.md`.

**Architecture:** A pure composition layer (`web/src/lib/dashboard/compose.ts` + `copy.ts`, both unit-tested) merges the outputs of the EXISTING `loadQueue` and `getOrCreateBrief` into a `DashboardList`; one new client component `TodayList.tsx` renders it (absorbing the send/skip handlers from `OutboundQueue.tsx`); `MorningBrief.tsx` and `OutboundQueue.tsx` are deleted; `ClaimsTable.tsx` slims to a compact archive. Queue/brief/engine logic is untouched except two **additive** output fields on `SendItem`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, Tailwind v4, RTL Hebrew.

## Global Constraints

- **Branch:** `feat/dashboard-redesign` cut from `docs/dashboard-redesign-spec` (stacked: spec PR #42 ← this; both stack on #39). Never commit to `main`. Commits end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- **No queue/brief/engine behavior change.** Task 1's two new `SendItem` fields are additive outputs only — cooldown, caps, give-up, ordering, events, and the API route must not change.
- **Send semantics preserved verbatim:** send button = synchronous `window.open` FIRST, then fire-and-forget `POST /api/outbound/events` (`kind:'sent'`, with `body`); "לא היום" = same POST with `kind:'skipped'`; failed POST resets busy + shows "הרישום נכשל — נסה שוב".
- **No system vocabulary on the main screen:** no task keys, no status chips like "טופס נוצר", no tier names. All copy comes from `copy.ts`.
- **Timezone for greeting/date: `Asia/Jerusalem`** (server renders in UTC on Vercel; a 22:43 "בוקר טוב" is the bug this kills).
- **Hebrew strings verbatim from this plan.** Never manually reverse Hebrew. UI containers are `dir="rtl"`.
- **Tests from `web/`:** `npx vitest run <path>`. Full gate before the final commit: `npx vitest run && npm run lint && npm run build` (2 pre-existing lint warnings in `ChecklistPanel.tsx` / `dashboard/[id]/page.tsx` are acceptable).
- This Next.js is **v16** — read `web/node_modules/next/dist/docs/` before writing route/page code you're unsure of.
- **No migration.** Nothing touches the database.

---

### Task 1: `SendItem` gains `doc_labels` + `last_sent_at` (additive)

**Files:**
- Modify: `web/src/lib/outbound/queue.ts` (the `SendItem` type + the one place `send.push({...})` happens)
- Modify: `web/src/lib/outbound/load.ts` (no change expected — verify only; `QueueClaim.blocking_labels` already feeds buildQueue)
- Test: `web/src/lib/outbound/queue.test.ts` (append)

**Interfaces:**
- Consumes: existing `buildQueue` internals — `c.blocking_labels` (already chaseable-filtered in `load.ts`), the per-pair event list `pair` (newest-first, built for cooldown checks).
- Produces (used by Tasks 2, 4):
  - `SendItem.doc_labels: string[]` — the chaseable labels the message body was built from.
  - `SendItem.last_sent_at: string | null` — `created_at` of the newest `kind === "sent"` event for this `(claim, task_key)`, or null.

- [ ] **Step 1: Write the failing tests** (append to `queue.test.ts`; helpers `claim`/`task`/`ev`/`build`/`daysAgo` already exist at the top of the file)

```ts
describe("buildQueue — SendItem presentation fields", () => {
  it("carries the chaseable labels as doc_labels", () => {
    const q = build([claim({ blocking_labels: ["רישיון נהיגה", "תמונות נזק"] })], [task()]);
    expect(q.send[0].doc_labels).toEqual(["רישיון נהיגה", "תמונות נזק"]);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/outbound/queue.test.ts`
Expected: FAIL — `doc_labels` / `last_sent_at` undefined.

- [ ] **Step 3: Implement.** In the `SendItem` type add:

```ts
  // Presentation-only fields (dashboard cards) — no queue logic reads these.
  doc_labels: string[];        // chaseable labels the body was built from
  last_sent_at: string | null; // newest kind='sent' event for this (claim, key)
```

In the `send.push({ ... })` call (after the cooldown check, where `pair` is in scope) add:

```ts
      doc_labels: c.blocking_labels,
      last_sent_at: pair.find((e) => e.kind === "sent")?.created_at ?? null,
```

(`pair` is sorted newest-first, so `find` returns the most recent sent.)

- [ ] **Step 4: Run the full outbound suite**

Run: `cd web && npx vitest run src/lib/outbound/`
Expected: PASS — all pre-existing cases untouched (fields are additive).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/outbound/queue.ts web/src/lib/outbound/queue.test.ts
git commit -m "feat: SendItem carries doc_labels + last_sent_at for card rendering"
```

---

### Task 2: `copy.ts` — the language layer

**Files:**
- Create: `web/src/lib/dashboard/copy.ts`
- Test: `web/src/lib/dashboard/copy.test.ts`

**Interfaces:**
- Consumes: nothing project-specific (pure strings + `Intl`).
- Produces (used by Tasks 3–5):

```ts
export function greeting(now: Date): string;           // בוקר/צהריים/ערב/לילה per Asia/Jerusalem hour
export function hebDate(now: Date): string;            // "יום שני, 11 באוגוסט"
export const TRACK_LABEL: Record<string, string>;      // own_policy→"פוליסת הלקוח", third_party_report→"צד ג׳ — דוח", third_party_settlement→"צד ג׳ — הסדר", unknown→"טרם סווג"
export function sendActionLine(opts: { taskKey: string; docLabels: string[]; lastSentAt: string | null }, now: Date): string;
export function doActionLine(title: string, overdueDays: number): string;
export function unclassifiedLine(daysOpen: number): string;
export function waitingLine(next: { title: string; due_at: string | null } | null): string;
export const WAITING_NOTE: string;                     // "תקין — המערכת תזכיר כשיגיע הזמן לפעול"
export const ALL_DONE_NOTE: string;                    // "הכל טופל להיום ✅"
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  ALL_DONE_NOTE, TRACK_LABEL, WAITING_NOTE,
  doActionLine, greeting, hebDate, sendActionLine, unclassifiedLine, waitingLine,
} from "./copy";

describe("greeting", () => {
  // 06:00 UTC = 09:00 Israel (summer, UTC+3)
  it("morning at 09:00 Israel time", () =>
    expect(greeting(new Date("2026-08-11T06:00:00Z"))).toBe("בוקר טוב"));
  it("afternoon at 13:00 Israel time", () =>
    expect(greeting(new Date("2026-08-11T10:00:00Z"))).toBe("צהריים טובים"));
  it("evening at 20:00 Israel time — the 22:43-בוקר-טוב bug", () =>
    expect(greeting(new Date("2026-08-11T17:00:00Z"))).toBe("ערב טוב"));
  it("night at 02:00 Israel time", () =>
    expect(greeting(new Date("2026-08-11T23:00:00Z"))).toBe("לילה טוב"));
});

describe("hebDate", () => {
  it("renders weekday + day + month in Hebrew", () => {
    const s = hebDate(new Date("2026-08-11T06:00:00Z")); // Tuesday
    expect(s).toContain("יום שלישי");
    expect(s).toContain("11 באוגוסט");
  });
});

describe("sendActionLine", () => {
  const NOW = new Date("2026-08-11T06:00:00Z");
  it("names the missing docs and the last reminder age", () => {
    const s = sendActionLine(
      { taskKey: "chase_missing_docs", docLabels: ["רישיון נהיגה", "תמונות נזק"], lastSentAt: "2026-08-06T06:00:00Z" },
      NOW,
    );
    expect(s).toBe("מחכים לרישיון נהיגה ותמונות נזק מהלקוח · תזכורת אחרונה לפני 5 ימים");
  });
  it("no docs listed → generic; never sent → טרם נשלחה תזכורת", () => {
    const s = sendActionLine({ taskKey: "chase_missing_docs", docLabels: [], lastSentAt: null }, NOW);
    expect(s).toBe("מחכים למסמכים מהלקוח · טרם נשלחה תזכורת");
  });
  it("tp-insurer chase has its own line", () => {
    const s = sendActionLine({ taskKey: "get_tp_insurer", docLabels: [], lastSentAt: null }, NOW);
    expect(s).toBe("מחכים לפרטי המבטח של הצד השני מהלקוח · טרם נשלחה תזכורת");
  });
});

describe("small lines", () => {
  it("doActionLine", () => {
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 20)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח · באיחור 20 ימים");
    expect(doActionLine("פתיחת תביעה מול מבטח הלקוח", 0)).toBe("תורך: פתיחת תביעה מול מבטח הלקוח");
  });
  it("unclassifiedLine", () =>
    expect(unclassifiedLine(42)).toBe("התיק מחכה לסיווג מסלול כבר 42 יום"));
  it("waitingLine with and without a tracked task", () => {
    expect(waitingLine({ title: "מעקב תשובת מבטח", due_at: "2026-08-20T00:00:00Z" })).toBe("במעקב: מעקב תשובת מבטח · עד 20.8");
    expect(waitingLine(null)).toBe("אין פעולות פתוחות");
  });
  it("constants exist", () => {
    expect(TRACK_LABEL.unknown).toBe("טרם סווג");
    expect(WAITING_NOTE.length).toBeGreaterThan(0);
    expect(ALL_DONE_NOTE).toContain("✅");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/dashboard/copy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `copy.ts`**

```ts
// The dashboard's language layer: system vocabulary in, agent Hebrew out.
// Every user-visible string on the main screen comes from here (spec §5).

const DAY_MS = 86_400_000;
const TZ = "Asia/Jerusalem";

function israelHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now),
  );
}

export function greeting(now: Date): string {
  const h = israelHour(now);
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 22) return "ערב טוב";
  return "לילה טוב";
}

export function hebDate(now: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long", day: "numeric", month: "long", timeZone: TZ,
  }).format(now);
}

export const TRACK_LABEL: Record<string, string> = {
  own_policy: "פוליסת הלקוח",
  third_party_report: "צד ג׳ — דוח",
  third_party_settlement: "צד ג׳ — הסדר",
  unknown: "טרם סווג",
};

// Hebrew list join: "א", "א וב", "א, ב וג"
function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

function reminderTail(lastSentAt: string | null, now: Date): string {
  if (!lastSentAt) return "טרם נשלחה תזכורת";
  const days = Math.max(0, Math.floor((now.getTime() - new Date(lastSentAt).getTime()) / DAY_MS));
  if (days === 0) return "תזכורת נשלחה היום";
  if (days === 1) return "תזכורת אחרונה אתמול";
  return `תזכורת אחרונה לפני ${days} ימים`;
}

export function sendActionLine(
  opts: { taskKey: string; docLabels: string[]; lastSentAt: string | null },
  now: Date,
): string {
  const head =
    opts.taskKey === "get_tp_insurer"
      ? "מחכים לפרטי המבטח של הצד השני מהלקוח"
      : opts.docLabels.length
        ? `מחכים ל${joinHe(opts.docLabels)} מהלקוח`
        : "מחכים למסמכים מהלקוח";
  return `${head} · ${reminderTail(opts.lastSentAt, now)}`;
}

export function doActionLine(title: string, overdueDays: number): string {
  return overdueDays > 0 ? `תורך: ${title} · באיחור ${overdueDays} ימים` : `תורך: ${title}`;
}

export function unclassifiedLine(daysOpen: number): string {
  return `התיק מחכה לסיווג מסלול כבר ${daysOpen} יום`;
}

export function waitingLine(next: { title: string; due_at: string | null } | null): string {
  if (!next) return "אין פעולות פתוחות";
  const due = next.due_at
    ? ` · עד ${new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: TZ }).format(new Date(next.due_at))}`
    : "";
  return `במעקב: ${next.title}${due}`;
}

export const WAITING_NOTE = "תקין — המערכת תזכיר כשיגיע הזמן לפעול";
export const ALL_DONE_NOTE = "הכל טופל להיום ✅";
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/dashboard/copy.test.ts`
Expected: PASS. (If the `hebDate` weekday assertion fails, check the date really is a Tuesday in Israel time — do not "fix" by loosening the assertion to a regex.)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dashboard/copy.ts web/src/lib/dashboard/copy.test.ts
git commit -m "feat: dashboard language layer (copy.ts)"
```

---

### Task 3: `compose.ts` — section assignment + ordering

**Files:**
- Create: `web/src/lib/dashboard/compose.ts`
- Test: `web/src/lib/dashboard/compose.test.ts`

**Interfaces:**
- Consumes: `type Brief, BriefItem` from `@/lib/brief/brief` (`BriefItem` has `claim_id, tier, reason, score, blocking_labels, next_task`); `type OutboundQueue, SendItem, DoItem` from `@/lib/outbound/queue` (Task 1's fields included); `TIER_ORDER, type Tier` from `@/lib/brief/rank`; copy functions (Task 2).
- Produces (used by Tasks 4–6):

```ts
export type ComposeClaim = {
  id: string; client_name: string | null; claim_type: string; status: string;
  submitted_at: string | null; created_at: string;
};
export type OpenTaskLite = { claim_id: string; title: string; due_at: string | null };
export type ClaimCard = {
  claim_id: string; client_name: string | null; track_label: string;
  action_line: string; ai_line: string | null; also_line: string | null;
  send: SendItem | null;   // non-null → card renders the send/skip button pair
  overdue_days: number;
};
export type DashboardList = { attention: ClaimCard[]; waiting: ClaimCard[]; ok: ClaimCard[] };
export function composeDashboard(input: {
  claims: ComposeClaim[];        // OPEN claims only — caller filters closed/abandoned
  queue: OutboundQueue | null;
  brief: Brief | null;
  openTasks: OpenTaskLite[];     // status != 'done', all open claims
  now: Date;
}): DashboardList;
```

This task implements **sectioning + ordering** with placeholder-free but minimal card text (`action_line` may temporarily be the raw task title); Task 4 finishes the card anatomy. Tests in this task assert section membership and order only — they must not pin `action_line` strings.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/dashboard/compose.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `compose.ts`** (sectioning + ordering; card text minimal — Task 4 replaces the marked block)

```ts
import type { Brief, BriefItem } from "@/lib/brief/brief";
import type { DoItem, OutboundQueue, SendItem } from "@/lib/outbound/queue";
import { TIER_ORDER, type Tier } from "@/lib/brief/rank";
import { TRACK_LABEL } from "./copy";

const DAY_MS = 86_400_000;

export type ComposeClaim = {
  id: string; client_name: string | null; claim_type: string; status: string;
  submitted_at: string | null; created_at: string;
};
export type OpenTaskLite = { claim_id: string; title: string; due_at: string | null };
export type ClaimCard = {
  claim_id: string; client_name: string | null; track_label: string;
  action_line: string; ai_line: string | null; also_line: string | null;
  send: SendItem | null;
  overdue_days: number;
};
export type DashboardList = { attention: ClaimCard[]; waiting: ClaimCard[]; ok: ClaimCard[] };

export function composeDashboard(input: {
  claims: ComposeClaim[];
  queue: OutboundQueue | null;
  brief: Brief | null;
  openTasks: OpenTaskLite[];
  now: Date;
}): DashboardList {
  const { claims, queue, brief, openTasks, now } = input;

  const sendBy = new Map<string, SendItem>((queue?.send ?? []).map((s) => [s.claim_id, s]));
  const dosBy = new Map<string, DoItem[]>();
  for (const d of queue?.doToday ?? []) {
    const list = dosBy.get(d.claim_id) ?? [];
    list.push(d);
    dosBy.set(d.claim_id, list);
  }
  for (const list of dosBy.values()) list.sort((a, b) => b.overdue_days - a.overdue_days);
  const briefBy = new Map<string, BriefItem>((brief?.items ?? []).map((i) => [i.claim_id, i]));
  const futureBy = new Map<string, OpenTaskLite[]>();
  for (const t of openTasks) {
    if (t.due_at && new Date(t.due_at).getTime() > now.getTime()) {
      const list = futureBy.get(t.claim_id) ?? [];
      list.push(t);
      futureBy.set(t.claim_id, list);
    }
  }
  for (const list of futureBy.values())
    list.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  const attention: ClaimCard[] = [];
  const waiting: ClaimCard[] = [];
  const ok: ClaimCard[] = [];

  for (const c of claims) {
    const send = sendBy.get(c.id) ?? null;
    const dos = dosBy.get(c.id) ?? [];
    const b = briefBy.get(c.id);
    const unclassified = c.claim_type === "unknown" && !!c.submitted_at;

    // ── Task 4 replaces this block with the full card anatomy ──
    const card: ClaimCard = {
      claim_id: c.id, client_name: c.client_name,
      track_label: TRACK_LABEL[c.claim_type] ?? c.claim_type,
      action_line: send?.task_key ?? dos[0]?.title ?? "",
      ai_line: b?.reason ? `🤖 ${b.reason}` : null,
      also_line: null,
      send,
      overdue_days: Math.max(send?.overdue_days ?? 0, dos[0]?.overdue_days ?? 0),
    };
    // ───────────────────────────────────────────────────────────

    if (send || dos.length > 0 || unclassified || b?.tier === "act_now") {
      attention.push(card);
    } else if (futureBy.has(c.id) || b?.tier === "waiting" || b?.tier === "this_week") {
      waiting.push(card);
    } else {
      ok.push(card);
    }
  }

  const tierOrd = (t: Tier | null | undefined) => (t ? TIER_ORDER[t] : Number.MAX_SAFE_INTEGER);
  attention.sort((a, b) => {
    const ba = briefBy.get(a.claim_id); const bb = briefBy.get(b.claim_id);
    return tierOrd(ba?.tier) - tierOrd(bb?.tier) || (bb?.score ?? 0) - (ba?.score ?? 0) || b.overdue_days - a.overdue_days;
  });
  waiting.sort((a, b) => {
    const na = futureBy.get(a.claim_id)?.[0]?.due_at; const nb = futureBy.get(b.claim_id)?.[0]?.due_at;
    return (na ? new Date(na).getTime() : Infinity) - (nb ? new Date(nb).getTime() : Infinity);
  });
  ok.sort((a, b) => (a.client_name ?? "").localeCompare(b.client_name ?? "", "he"));

  return { attention, waiting, ok };
}
```

(The unused `DAY_MS` and full copy imports arrive in Task 4 — if lint complains about `DAY_MS`, omit it until Task 4.)

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/dashboard/compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dashboard/compose.ts web/src/lib/dashboard/compose.test.ts
git commit -m "feat: dashboard composition — sections and ordering"
```

---

### Task 4: `compose.ts` — card anatomy (primary action, וגם-line, copy wiring)

**Files:**
- Modify: `web/src/lib/dashboard/compose.ts` (the marked block)
- Test: `web/src/lib/dashboard/compose.test.ts` (append)

**Interfaces:**
- Consumes: `sendActionLine`, `doActionLine`, `unclassifiedLine`, `waitingLine` from `./copy` (Task 2); `SendItem.doc_labels`/`last_sent_at` (Task 1).
- Produces: final `ClaimCard` semantics — `send !== null` ⇒ send is the primary action; `action_line`/`also_line` per spec §3.

- [ ] **Step 1: Write the failing tests** (append; helpers from Task 3 in scope)

```ts
describe("composeDashboard — card anatomy", () => {
  it("send is primary; the most-overdue do-task becomes the וגם line", () => {
    const d = compose([cl()], q(
      [sendItem({ doc_labels: ["רישיון נהיגה"], last_sent_at: null })],
      [doItem({ title: "לוודא דוח שמאי", overdue_days: 25 }), doItem({ title: "פתיחת תביעה", overdue_days: 3 })],
    ), null);
    const card = d.attention[0];
    expect(card.send).not.toBeNull();
    expect(card.action_line).toBe("מחכים לרישיון נהיגה מהלקוח · טרם נשלחה תזכורת");
    expect(card.also_line).toBe("וגם: לוודא דוח שמאי (באיחור 25 ימים)");
  });

  it("no send → most-overdue do-task is primary, runner-up is וגם", () => {
    const d = compose([cl()], q([], [
      doItem({ title: "לוודא דוח שמאי", overdue_days: 25 }),
      doItem({ title: "פתיחת תביעה", overdue_days: 3 }),
    ]), null);
    const card = d.attention[0];
    expect(card.send).toBeNull();
    expect(card.action_line).toBe("תורך: לוודא דוח שמאי · באיחור 25 ימים");
    expect(card.also_line).toBe("וגם: פתיחת תביעה (באיחור 3 ימים)");
  });

  it("escalation do-item keeps its own title as the action line, verbatim", () => {
    const title = 'הלקוח לא מגיב על „להשלים מסמכים" (3 תזכורות) — ליצור קשר טלפוני';
    const d = compose([cl()], q([], [doItem({ title, escalation: true, overdue_days: 24 })]), null);
    expect(d.attention[0].action_line).toBe(title);
  });

  it("unclassified with no queue items → classification prompt", () => {
    const d = compose([cl({ claim_type: "unknown", created_at: daysFromNow(-42) })], q(), null);
    expect(d.attention[0].action_line).toBe("התיק מחכה לסיווג מסלול כבר 42 יום");
  });

  it("waiting card shows the tracked task; single do-task has no וגם line", () => {
    const d = compose([cl()], q(), null, [{ claim_id: "c1", title: "מעקב תשובת מבטח", due_at: daysFromNow(7) }]);
    expect(d.waiting[0].action_line).toContain("במעקב: מעקב תשובת מבטח");
    const d2 = compose([cl()], q([], [doItem()]), null);
    expect(d2.attention[0].also_line).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/dashboard/compose.test.ts`
Expected: FAIL on the new describe block.

- [ ] **Step 3: Replace the marked block** in `composeDashboard`:

```ts
    // Card anatomy (spec §3): one card per claim; client message wins primary,
    // else the most-overdue do-task, else the classification prompt, else the
    // waiting/ok line. Whatever lost the primary slot becomes one "וגם:" line.
    const daysOpen = Math.max(0, Math.floor((now.getTime() - new Date(c.created_at).getTime()) / DAY_MS));
    const nextFuture = futureBy.get(c.id)?.[0] ?? null;

    let action_line: string;
    let also: DoItem | null = null;
    if (send) {
      action_line = sendActionLine(
        { taskKey: send.task_key, docLabels: send.doc_labels, lastSentAt: send.last_sent_at },
        now,
      );
      also = dos[0] ?? null;
    } else if (dos.length > 0) {
      action_line = dos[0].escalation ? dos[0].title : doActionLine(dos[0].title, dos[0].overdue_days);
      also = dos[1] ?? null;
    } else if (unclassified) {
      action_line = unclassifiedLine(daysOpen);
    } else {
      action_line = waitingLine(nextFuture);
    }

    const card: ClaimCard = {
      claim_id: c.id, client_name: c.client_name,
      track_label: TRACK_LABEL[c.claim_type] ?? c.claim_type,
      action_line,
      ai_line: b?.reason ? `🤖 ${b.reason}` : null,
      also_line: also ? `וגם: ${also.title} (באיחור ${also.overdue_days} ימים)` : null,
      send,
      overdue_days: Math.max(send?.overdue_days ?? 0, dos[0]?.overdue_days ?? 0),
    };
```

Add the imports: `import { TRACK_LABEL, doActionLine, sendActionLine, unclassifiedLine, waitingLine } from "./copy";` (replacing the Task-3 import) and the `DAY_MS` constant if omitted earlier.

- [ ] **Step 4: Run the dashboard suite**

Run: `cd web && npx vitest run src/lib/dashboard/`
Expected: PASS — Task 3's section tests must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/dashboard/compose.ts web/src/lib/dashboard/compose.test.ts
git commit -m "feat: dashboard card anatomy — primary action and וגם line"
```

---

### Task 5: `TodayList.tsx` — the panel

**Files:**
- Create: `web/src/app/dashboard/TodayList.tsx`
- Reference (read, do not modify yet): `web/src/app/dashboard/OutboundQueue.tsx` — the send/skip handler pattern being absorbed

**Interfaces:**
- Consumes: `type DashboardList, ClaimCard` (Tasks 3–4); `ALL_DONE_NOTE, WAITING_NOTE` from `@/lib/dashboard/copy`; `POST /api/outbound/events` (existing).
- Produces (used by Task 6): `<TodayList list={DashboardList} greeting={string} dateLabel={string} claimsCount={number} />` (default export, client component).

- [ ] **Step 1: Implement** (no unit test — client components are untested in this repo; exercised by Task 6's gate + live check)

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClaimCard, DashboardList } from "@/lib/dashboard/compose";
import { ALL_DONE_NOTE, WAITING_NOTE } from "@/lib/dashboard/copy";
import type { SendItem } from "@/lib/outbound/queue";

function postEvent(item: SendItem, kind: "sent" | "skipped") {
  return fetch("/api/outbound/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_id: item.claim_id,
      task_id: item.task_id,
      task_key: item.task_key,
      kind,
      ...(kind === "sent" ? { body: item.body } : {}),
    }),
  });
}

function SendButtons({ item }: { item: SendItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same contract as the old OutboundQueue row: a failed write must not leave
  // the card dead — reset busy and hint; success refreshes (card recomposes).
  function settle(promise: Promise<Response>) {
    promise
      .then((res) => {
        if (res.ok) router.refresh();
        else { setBusy(false); setError("הרישום נכשל — נסה שוב"); }
      })
      .catch(() => { setBusy(false); setError("הרישום נכשל — נסה שוב"); });
  }
  // TRAP: window.open must run synchronously, before any state/fetch — an
  // await first and the popup blocker eats the send.
  function send() {
    if (item.href) window.open(item.href, "_blank", "noopener,noreferrer");
    setBusy(true); setError(null);
    settle(postEvent(item, "sent"));
  }
  function skip() {
    setBusy(true); setError(null);
    settle(postEvent(item, "skipped"));
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button type="button" onClick={send} disabled={busy || !item.href}
        title={item.href ? undefined : "מספר טלפון חסר או לא תקין"}
        className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
        📤 שלח תזכורת
      </button>
      <button type="button" onClick={skip} disabled={busy}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
        לא היום
      </button>
    </div>
  );
}

function Card({ card, tone }: { card: ClaimCard; tone: "red" | "amber" | "plain" }) {
  const border =
    tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : "border-zinc-200";
  const lineColor =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-800" : "text-zinc-500";
  return (
    <li className={`rounded-xl border ${border} bg-white p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/dashboard/${card.claim_id}`} className="font-medium text-zinc-900 hover:underline">
            {card.client_name ?? "ללא שם"}
          </Link>{" "}
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{card.track_label}</span>
          <p className={`text-sm ${lineColor}`}>{card.action_line}</p>
          {card.ai_line && <p className="text-xs text-zinc-400">{card.ai_line}</p>}
          {card.also_line && <p className="text-xs text-amber-800">{card.also_line}</p>}
        </div>
        {card.send ? (
          <SendButtons item={card.send} />
        ) : tone !== "plain" ? (
          <Link href={`/dashboard/${card.claim_id}`}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50">
            פתח את התיק ←
          </Link>
        ) : null}
      </div>
      {card.send && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-zinc-400">▸ מה יישלח?</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700" dir="rtl">
            {card.send.body}
          </pre>
        </details>
      )}
    </li>
  );
}

export default function TodayList({
  list, greeting, dateLabel, claimsCount,
}: { list: DashboardList; greeting: string; dateLabel: string; claimsCount: number }) {
  const { attention, waiting, ok } = list;

  return (
    <section dir="rtl">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-zinc-900">
          {greeting}, הסוכן 👋 <span className="text-sm font-normal text-zinc-500">· {dateLabel}</span>
        </h2>
      </div>

      {claimsCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="font-medium text-zinc-800">צור את התביעה הראשונה שלך</p>
          <p className="mt-1 text-sm text-zinc-500">
            לחץ "תביעה חדשה", שלח ללקוח את הקישור — והמערכת תאסוף את המסמכים והפרטים בשבילך.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <a href="#sec-attention" className="flex-1 rounded-xl border border-red-200 bg-red-50 p-2 text-center">
              <div className="text-xl font-extrabold text-red-600">{attention.length}</div>
              <div className="text-xs text-zinc-600">צריך אותך</div>
            </a>
            <a href="#sec-waiting" className="flex-1 rounded-xl border border-amber-200 bg-amber-50 p-2 text-center">
              <div className="text-xl font-extrabold text-amber-700">{waiting.length}</div>
              <div className="text-xs text-zinc-600">בהמתנה</div>
            </a>
            <a href="#sec-ok" className="flex-1 rounded-xl border border-green-200 bg-green-50 p-2 text-center">
              <div className="text-xl font-extrabold text-green-700">{ok.length}</div>
              <div className="text-xs text-zinc-600">תקינים</div>
            </a>
          </div>

          {attention.length > 0 ? (
            <div id="sec-attention" className="mb-4">
              <p className="mb-2 text-sm font-bold text-red-700">🔔 צריך אותך היום ({attention.length})</p>
              <ul className="space-y-2">
                {attention.map((c) => (
                  <Card key={c.claim_id} card={c} tone={c.send ? "red" : "amber"} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {ALL_DONE_NOTE}
            </p>
          )}

          {waiting.length > 0 && (
            <div id="sec-waiting" className="mb-4">
              <p className="mb-2 text-sm font-bold text-zinc-500">⏳ בהמתנה לאחרים ({waiting.length})</p>
              <ul className="space-y-2">
                {waiting.map((c) => (
                  <Card key={c.claim_id} card={{ ...c, ai_line: c.ai_line ?? `🤖 ${WAITING_NOTE}` }} tone="plain" />
                ))}
              </ul>
            </div>
          )}

          {ok.length > 0 && (
            <details id="sec-ok" className="mb-2">
              <summary className="cursor-pointer rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                ✅ {ok.length} תיקים תקינים — הצג
              </summary>
              <ul className="mt-2 space-y-2">
                {ok.map((c) => (
                  <Card key={c.claim_id} card={c} tone="plain" />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
```

Note on the greeting name: the agent's display name is not in the page's data today — render `{greeting}, הסוכן 👋`? **No** — that reads robotic. Use the email local-part fallback the header already shows? Also weak. **Decision: greeting takes an optional `name` prop** — `{greeting}{name ? `, ${name}` : ""} 👋` — and Task 6 passes `user.email?.split("@")[0]` for now, with a note that a proper agent display-name is a separate change. Adjust the component accordingly (add `name?: string | null` prop).

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/dashboard/TodayList.tsx
git commit -m "feat: TodayList panel — sectioned cards with send/skip"
```

---

### Task 6: Wire the page, delete the old panels, slim the archive table

**Files:**
- Modify: `web/src/app/dashboard/page.tsx`
- Modify: `web/src/app/dashboard/ClaimsTable.tsx`
- Delete: `web/src/app/dashboard/MorningBrief.tsx`, `web/src/app/dashboard/OutboundQueue.tsx`

**Interfaces:**
- Consumes: `composeDashboard` (Tasks 3–4), `TodayList` (Task 5), `greeting`/`hebDate` (Task 2); existing `getOrCreateBrief`, `loadQueue`.
- Produces: the final page.

- [ ] **Step 1: Rewire `page.tsx`.** Replace the `MorningBrief`/`OutboundQueue` imports with:

```tsx
import TodayList from "./TodayList";
import { composeDashboard } from "@/lib/dashboard/compose";
import { greeting, hebDate } from "@/lib/dashboard/copy";
```

After the existing `claims` + `taskRows` queries (both already selected — `taskRows` has `claim_id, title, due_at`), build the inputs and render:

```tsx
  const now = new Date();
  const openClaims = (claims ?? []).filter((c) => c.status !== "closed" && c.status !== "abandoned");
  const list = composeDashboard({
    claims: openClaims.map((c) => ({
      id: c.id, client_name: c.client_name, claim_type: c.claim_type,
      status: c.status, submitted_at: c.submitted_at, created_at: c.created_at,
    })),
    queue, brief,
    openTasks: (taskRows ?? []).map((t) => ({ claim_id: t.claim_id, title: t.title, due_at: t.due_at })),
    now,
  });
```

In the JSX, replace the two panel lines with:

```tsx
        <TodayList
          list={list}
          greeting={greeting(now)}
          dateLabel={hebDate(now)}
          name={user.email?.split("@")[0] ?? null}
          claimsCount={openClaims.length}
        />

        <ClaimsTable claims={claimsWithTasks} />
```

Keep the brief/queue loading block exactly as-is (both still feed compose; the failure contract carries over — a null queue or brief degrades per spec §4). Keep the "תביעות" heading + `NewClaimForm` row above the list.

- [ ] **Step 2: Slim `ClaimsTable.tsx` to the archive form.** The table becomes: header row "כל התיקים (N)" + client search + "כולל סגורים" toggle (default OFF — closed/abandoned hidden); columns **לקוח · סוג · תאריך · קישור** only. Delete: `STATUS_LABEL`, `STATUS_COLOR`, the status column, the next-task column, the `sortByDue` state, and the `next_task` field from the local `Claim` interface. Add at the top of the component:

```tsx
  const [query, setQuery] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const rows = claims.filter((c) => {
    if (!showClosed && (c.status === "closed" || c.status === "abandoned")) return false;
    if (!query) return true;
    const q = query.trim();
    return (c.client_name ?? "").includes(q) || (c.client_phone ?? "").includes(q);
  });
```

Header bar above the table (inside the component's root, `dir="rtl"` context is inherited from the page):

```tsx
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <span className="text-sm font-bold text-zinc-600">כל התיקים ({rows.length})</span>
        <span className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לקוח…"
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
          />
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            כולל סגורים
          </label>
        </span>
      </div>
```

Closed rows (when shown) get `text-zinc-400` on the name cell. Keep `CopyLinkButton`, the urgent `⚑`, the phone line under the name, and the empty-state paragraph exactly as they are.

- [ ] **Step 3: Delete the superseded panels**

```bash
git rm web/src/app/dashboard/MorningBrief.tsx web/src/app/dashboard/OutboundQueue.tsx
```

Then `cd web && npx tsc --noEmit` — expect NO dangling imports (page.tsx was rewired in Step 1; nothing else imports these two — verify with a grep if tsc disagrees).

- [ ] **Step 4: Full gate**

Run: `cd web && npx vitest run && npm run lint && npm run build`
Expected: all tests pass, lint 0 errors (2 pre-existing warnings acceptable), build clean.

- [ ] **Step 5: Live check** (dev server against dev Supabase)

Confirm: (a) greeting matches the actual Israel-time part of day; (b) three number chips equal the three section counts; (c) a claim with a due chase shows one card with 📤 שלח תזכורת + "לא היום" + "▸ מה יישלח?"; (d) a claim with send+do shows ONE card with a "וגם:" line; (e) "לא היום" removes the card on refresh and the claim drops to בהמתנה/תקינים; (f) no status chips ("טופס נוצר") anywhere above the archive table; (g) archive search filters, "כולל סגורים" reveals closed rows; (h) `MorningBrief`/`OutboundQueue` gone from the page.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/dashboard/page.tsx web/src/app/dashboard/ClaimsTable.tsx
git commit -m "feat: one-list dashboard — TodayList replaces brief+queue panels, archive table"
```

---

## Post-plan notes

- **PR:** push `feat/dashboard-redesign`, open a PR with base `docs/dashboard-redesign-spec` (stacked: #39 ← #42 ← this). No migration.
- The old `BriefItem.next_task` and `blocking_labels` fields still feed the cockpit and compose — do NOT prune `brief.ts`/`facts.ts` "while we're here."
- Guided mode, agent display names, and any queue/brief logic changes are out of scope (spec §8).
