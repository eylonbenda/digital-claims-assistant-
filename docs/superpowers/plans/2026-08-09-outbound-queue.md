# Outbound Queue (Phase-2 C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-lane approval queue on `/dashboard` — one-tap `wa.me` client chases (recorded as events) + a due-today agent action list — per spec `docs/superpowers/specs/2026-08-09-outbound-queue-design.md`.

**Architecture:** Append-only `outbound_events` table (migration 008); pure queue derivation in `web/src/lib/outbound/` (rules → buildQueue → one I/O wrapper, mirroring `web/src/lib/brief/`); one POST route; one dashboard panel. The queue is derived on every read and never stale by construction; only sends/skips are persisted.

**Tech Stack:** Next.js 16 (App Router, async `params`), TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind v4, RTL Hebrew UI.

## Global Constraints

- **Branch + PR, never commit to `main`.** Work on `feat/outbound-queue` cut from `main`. Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- **Migrations are manual, two-place:** run `008` in the **dev** Supabase SQL editor while building; the **prod** (`claims-pilot`) editor before/with merge. Deploying code never touches schema.
- **Next.js here is v16** — read `web/node_modules/next/dist/docs/` before writing route/page code (`params` is a Promise, `headers()` is async).
- **UI strings Hebrew, identifiers English.** Panels are `dir="rtl"`.
- **Tests:** run from `web/`: `npx vitest run <path>` (config `web/vitest.config.ts`).
- **Lint/build gate before the final commit:** `cd web && npm run lint && npm run build`.
- The lane-2 property is named **`doToday`**, not `do` — `do` is a reserved word and cannot be a destructuring binding.
- `kind='sent'` means *the agent tapped the link*, not "delivered" — keep this comment on the table and in `rules.ts`.

---

### Task 1: Migration 008 — `outbound_events`

**Files:**
- Create: `web/db/migrations/008_outbound_events.sql`
- Modify: `web/db/schema.sql` (table + index + policy **before** the `-- ---------- grants ----------` block, ~line 195)

**Interfaces:**
- Produces: table `outbound_events(id, claim_id, task_id, task_key, recipient_kind, channel, kind, body_snapshot, actor, created_at)` — read by Task 6 (`load.ts`), written by Task 7 (API route).

- [ ] **Step 1: Write the migration**

```sql
-- 008: outbound_events — append-only log of outbound-queue decisions (phase-2 C1).
-- One row per send/skip. The queue itself is DERIVED on read from tasks +
-- checklist state; only what happened is persisted, so nothing here can go stale.
-- NOTE: kind='sent' means "the agent tapped the wa.me link", NOT "delivered" —
-- wa.me reports nothing back. Adequate for cooldowns; must become a real
-- delivery record (BSP receipts) before any rule flips to auto.
create table if not exists outbound_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  task_key text not null,
  recipient_kind text not null default 'client',
  channel text not null default 'whatsapp',
  kind text not null check (kind in ('sent', 'skipped')),
  body_snapshot text,                          -- what actually went out (kind='sent' only)
  actor text not null default 'agent' check (actor in ('agent', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists outbound_events_cooldown_idx
  on outbound_events (claim_id, task_key, created_at desc);

alter table outbound_events enable row level security;

-- Agent reads own rows via the auth client; writes go through the service
-- client only (no insert/update policy on purpose). Postgres has no
-- `create policy if not exists` — drop first so this stays safe to re-run
-- over a schema.sql that already contains it.
drop policy if exists "child: outbound_events" on outbound_events;
create policy "child: outbound_events" on outbound_events for select
  using (claim_belongs_to_me(claim_id));

grant select on outbound_events to authenticated;
grant all on outbound_events to service_role;
```

- [ ] **Step 2: Fold into `web/db/schema.sql`**

Add the same `create table` + `create index` after the `agent_briefs` table definition (so it sits **before** the grants block and the blanket `grant all on all tables` covers it). Add alongside the other child-table policies:

```sql
create policy "child: outbound_events" on outbound_events for select
  using (claim_belongs_to_me(claim_id));
```

(In `schema.sql` use the plain `create policy` form like its neighbors — no `drop policy` there; the file targets a fresh DB. Note this table is select-only for `authenticated`, unlike the `for all` child policies above it — copy the pattern of `agent_briefs`, not of `tasks`.)

- [ ] **Step 3: Apply to dev Supabase**

Paste `008_outbound_events.sql` into the **dev** Supabase SQL editor and run it. Confirm: `select * from outbound_events limit 1;` returns zero rows, no error. (**Human step if no dev DB access — flag in the task report rather than skipping silently.**)

- [ ] **Step 4: Commit**

```bash
git add web/db/migrations/008_outbound_events.sql web/db/schema.sql
git commit -m "feat: outbound_events table (migration 008)"
```

---

### Task 2: `wa.ts` — `waHref` + two new message builders

**Files:**
- Modify: `web/src/lib/wa.ts`
- Test: `web/src/lib/wa.test.ts` (exists — add cases)

**Interfaces:**
- Consumes: existing `waPhone`, `chaseMessage`, `ChaseOpts`.
- Produces (used by Tasks 3–5):
  - `waHref(phone: string | null, text: string): string | null`
  - `getTpInsurerMessage(opts: { firstName?: string | null }): string`
  - `collectPrivateReportMessage(opts: { firstName?: string | null; items?: string[]; uploadUrl: string }): string`

- [ ] **Step 1: Write the failing tests** (append to `wa.test.ts`)

```ts
describe("waHref", () => {
  it("builds a wa.me link with the encoded body", () => {
    expect(waHref("0521234567", "שלום")).toBe(
      `https://wa.me/972521234567?text=${encodeURIComponent("שלום")}`,
    );
  });
  it("returns null for a null or non-normalizable phone", () => {
    expect(waHref(null, "x")).toBeNull();
    expect(waHref("123", "x")).toBeNull();
  });
});

describe("getTpInsurerMessage", () => {
  it("greets by first name and asks for the TP insurer, no upload link", () => {
    const msg = getTpInsurerMessage({ firstName: "דנה" });
    expect(msg).toContain("שלום דנה");
    expect(msg).toContain("חברת הביטוח");
    expect(msg).not.toContain("http");
  });
  it("falls back to a generic greeting", () => {
    expect(getTpInsurerMessage({})).toContain("שלום,");
  });
});

describe("collectPrivateReportMessage", () => {
  it("lists the missing items as bullets with the upload link", () => {
    const msg = collectPrivateReportMessage({
      firstName: "דנה",
      items: ["קבלה על תשלום", "אישור אי-הגשה"],
      uploadUrl: "https://app.test/c/tok",
    });
    expect(msg).toContain("• קבלה על תשלום");
    expect(msg).toContain("• אישור אי-הגשה");
    expect(msg).toContain("https://app.test/c/tok");
  });
  it("uses a generic line when items are empty", () => {
    const msg = collectPrivateReportMessage({ uploadUrl: "https://app.test/c/tok" });
    expect(msg).not.toContain("•");
    expect(msg).toContain("https://app.test/c/tok");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/wa.test.ts`
Expected: FAIL — `waHref` / `getTpInsurerMessage` / `collectPrivateReportMessage` are not exported.

- [ ] **Step 3: Implement** (append to `wa.ts`; then refactor `chaseHref` to delegate)

```ts
// Generic wa.me deep link for an arbitrary pre-rendered body.
export function waHref(phone: string | null, text: string): string | null {
  const wa = phone ? waPhone(phone) : null;
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

const greet = (firstName?: string | null) =>
  firstName ? `שלום ${firstName}, בהמשך לתביעה שלך —` : `שלום, בהמשך לתביעה שלך —`;

// get_tp_insurer: the answer is a WhatsApp reply (name / photo of the TP's
// insurance card), so no upload link on purpose.
export function getTpInsurerMessage(opts: { firstName?: string | null }): string {
  return [
    greet(opts.firstName),
    `כדי שנוכל לפנות לחברת הביטוח של הצד השני, חסר לנו שם חברת הביטוח שלו.`,
    `אם יש ברשותך פרטי ביטוח מהתאונה (שם החברה או צילום התעודה) — אפשר לשלוח לי כאן.`,
    ``,
    `תודה!`,
  ].join("\n");
}

export function collectPrivateReportMessage(opts: {
  firstName?: string | null;
  items?: string[];
  uploadUrl: string;
}): string {
  const body =
    opts.items && opts.items.length
      ? [
          `כדי להגיש את הדרישה לחברת הביטוח של הצד השני חסרים המסמכים הבאים:`,
          ...opts.items.map((i) => `• ${i}`),
        ]
      : [`כדי להגיש את הדרישה לחברת הביטוח של הצד השני חסרים לנו עוד כמה מסמכים.`];
  return [greet(opts.firstName), ...body, ``, `אפשר להעלות אותם כאן: ${opts.uploadUrl}`, `תודה!`].join("\n");
}
```

Also refactor the existing `chaseHref` body to `return waHref(phone, chaseMessage(opts));` (behavior identical — existing `wa.test.ts` cases must still pass).

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/wa.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wa.ts web/src/lib/wa.test.ts
git commit -m "feat: waHref + TP-insurer and private-report chase builders"
```

---

### Task 3: `rules.ts` — send-rule descriptors (the flip-to-auto seam)

**Files:**
- Create: `web/src/lib/outbound/rules.ts`
- Test: `web/src/lib/outbound/rules.test.ts`

**Interfaces:**
- Consumes: `chaseMessage`, `getTpInsurerMessage`, `collectPrivateReportMessage` from `@/lib/wa` (Task 2).
- Produces (used by Tasks 4–5, 7):
  - `type MessageCtx = { firstName: string | null; blockingLabels: string[]; uploadUrl: string }`
  - `type SendRule = { taskKey: string; lane: "send"; recipientKind: "client"; channel: "whatsapp"; cooldownDays: number; auto: boolean; build: (ctx: MessageCtx) => string }`
  - `SEND_RULES: Record<string, SendRule>` (keys: `chase_missing_docs`, `get_tp_insurer`, `collect_private_report_docs`)
  - `RULE_PRIORITY: string[]`
  - `MAX_SENDS_BEFORE_CALL = 3`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { MAX_SENDS_BEFORE_CALL, RULE_PRIORITY, SEND_RULES } from "./rules";

const CTX = {
  firstName: "דנה",
  blockingLabels: ["רישיון נהיגה"],
  uploadUrl: "https://app.test/c/tok",
};

describe("SEND_RULES", () => {
  it("covers exactly the three client-directed task keys", () => {
    expect(Object.keys(SEND_RULES).sort()).toEqual([
      "chase_missing_docs",
      "collect_private_report_docs",
      "get_tp_insurer",
    ]);
  });

  it("every rule is manual (auto=false) in C1", () => {
    for (const rule of Object.values(SEND_RULES)) expect(rule.auto).toBe(false);
  });

  it("cooldowns match the spec (3/3/4)", () => {
    expect(SEND_RULES.chase_missing_docs.cooldownDays).toBe(3);
    expect(SEND_RULES.get_tp_insurer.cooldownDays).toBe(3);
    expect(SEND_RULES.collect_private_report_docs.cooldownDays).toBe(4);
  });

  it("builders render a greeting; doc-chases include the upload link", () => {
    expect(SEND_RULES.chase_missing_docs.build(CTX)).toContain("https://app.test/c/tok");
    expect(SEND_RULES.collect_private_report_docs.build(CTX)).toContain("https://app.test/c/tok");
    expect(SEND_RULES.get_tp_insurer.build(CTX)).toContain("שלום דנה");
  });

  it("priority list covers all rules; give-up threshold is 3", () => {
    expect([...RULE_PRIORITY].sort()).toEqual(Object.keys(SEND_RULES).sort());
    expect(MAX_SENDS_BEFORE_CALL).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/outbound/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `rules.ts`**

```ts
import { chaseMessage, collectPrivateReportMessage, getTpInsurerMessage } from "@/lib/wa";

// Everything the body builders may see. blockingLabels is the LIVE checklist
// state at render time — bodies are never persisted before send (spec §3).
export type MessageCtx = {
  firstName: string | null;
  blockingLabels: string[];
  uploadUrl: string;
};

export type SendRule = {
  taskKey: string;
  lane: "send";
  recipientKind: "client";
  channel: "whatsapp";
  cooldownDays: number;
  // THE flip-to-auto seam (spec §4). Always false in C1. When a rule flips,
  // a cron sender composes the same body and writes the same outbound_events
  // row with actor='system' — no other code changes.
  auto: boolean;
  build: (ctx: MessageCtx) => string;
};

const rule = (taskKey: string, cooldownDays: number, build: SendRule["build"]): SendRule => ({
  taskKey, lane: "send", recipientKind: "client", channel: "whatsapp",
  cooldownDays, auto: false, build,
});

export const SEND_RULES: Record<string, SendRule> = {
  chase_missing_docs: rule("chase_missing_docs", 3, (ctx) =>
    chaseMessage({ firstName: ctx.firstName, items: ctx.blockingLabels, uploadUrl: ctx.uploadUrl }),
  ),
  get_tp_insurer: rule("get_tp_insurer", 3, (ctx) =>
    getTpInsurerMessage({ firstName: ctx.firstName }),
  ),
  collect_private_report_docs: rule("collect_private_report_docs", 4, (ctx) =>
    collectPrivateReportMessage({ firstName: ctx.firstName, items: ctx.blockingLabels, uploadUrl: ctx.uploadUrl }),
  ),
};

// Highest first — breaks ties when two send rules are due on the same claim
// and the one-message-per-claim-per-day cap allows only one through.
export const RULE_PRIORITY = ["chase_missing_docs", "get_tp_insurer", "collect_private_report_docs"];

// After this many 'sent' events with no document arriving since, stop
// proposing and emit a phone-call escalation row instead (spec §5).
export const MAX_SENDS_BEFORE_CALL = 3;
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/outbound/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/outbound/rules.ts web/src/lib/outbound/rules.test.ts
git commit -m "feat: outbound send-rule descriptors with flip-to-auto seam"
```

---

### Task 4: `queue.ts` — lane split, due filter, cooldown, body/href

**Files:**
- Create: `web/src/lib/outbound/queue.ts`
- Test: `web/src/lib/outbound/queue.test.ts`

**Interfaces:**
- Consumes: `SEND_RULES`, `RULE_PRIORITY`, `MAX_SENDS_BEFORE_CALL`, `MessageCtx` (Task 3); `waHref` (Task 2); `TIER_ORDER`, `type Tier` from `@/lib/brief/rank` (existing).
- Produces (used by Tasks 5, 6, 8):

```ts
export type QueueClaim = {
  claim_id: string; client_name: string | null; client_phone: string | null;
  access_token: string; blocking_labels: string[];
  last_doc_uploaded_at: string | null;      // resets the give-up counter
  tier: Tier | null; reason: string | null; // from today's brief when available
  score: number;                            // 0 when the brief is down
};
export type QueueTaskRow = {
  id: string; claim_id: string; key: string | null; title: string;
  due_at: string | null; status: string; source: string;
};
export type OutboundEventRow = {
  claim_id: string; task_key: string; kind: "sent" | "skipped"; created_at: string;
};
export type SendItem = {
  claim_id: string; task_id: string; task_key: string;
  client_name: string | null; tier: Tier | null; reason: string | null;
  overdue_days: number; body: string; href: string | null;
};
export type DoItem = {
  claim_id: string; client_name: string | null; title: string;
  due_at: string | null; overdue_days: number; escalation: boolean;
};
export type OutboundQueue = { send: SendItem[]; doToday: DoItem[] };
export function buildQueue(input: {
  claims: QueueClaim[]; tasks: QueueTaskRow[]; events: OutboundEventRow[];
  origin: string; now: Date;
}): OutboundQueue;
```

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/outbound/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `queue.ts`** (daily cap + escalation + ordering are Task 5 — but write the structure so they slot in)

```ts
import { MAX_SENDS_BEFORE_CALL, RULE_PRIORITY, SEND_RULES } from "./rules";
import { waHref } from "@/lib/wa";
import { TIER_ORDER, type Tier } from "@/lib/brief/rank";

const DAY_MS = 86_400_000;

// [types exactly as in the Interfaces block above]

export function buildQueue(input: {
  claims: QueueClaim[]; tasks: QueueTaskRow[]; events: OutboundEventRow[];
  origin: string; now: Date;
}): OutboundQueue {
  const { claims, tasks, events, origin, now } = input;
  const claimById = new Map(claims.map((c) => [c.claim_id, c]));

  const overdueDays = (due: string) =>
    Math.max(0, Math.floor((now.getTime() - new Date(due).getTime()) / DAY_MS));

  // Only dated, open template tasks participate. Manual tasks stay in
  // TasksPanel / the next-task column — this queue dispatches engine work.
  const due = tasks.filter(
    (t) =>
      t.status === "todo" &&
      t.source === "template" &&
      t.key !== null &&
      t.due_at !== null &&
      new Date(t.due_at).getTime() <= now.getTime() &&
      claimById.has(t.claim_id),
  );

  // Events indexed per (claim, key), newest first.
  const evByPair = new Map<string, OutboundEventRow[]>();
  for (const e of events) {
    const k = `${e.claim_id} ${e.task_key}`;
    const list = evByPair.get(k) ?? [];
    list.push(e);
    evByPair.set(k, list);
  }
  for (const list of evByPair.values())
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const send: SendItem[] = [];
  const doToday: DoItem[] = [];

  for (const t of due) {
    const c = claimById.get(t.claim_id)!;
    const rule = t.key ? SEND_RULES[t.key] : undefined;

    if (!rule) {
      doToday.push({
        claim_id: c.claim_id, client_name: c.client_name, title: t.title,
        due_at: t.due_at, overdue_days: overdueDays(t.due_at!), escalation: false,
      });
      continue;
    }

    const pair = evByPair.get(`${c.claim_id} ${t.key}`) ?? [];

    // Give-up: N sends with no document arriving since → phone-call escalation.
    const sentSinceUpload = pair.filter(
      (e) => e.kind === "sent" &&
        (!c.last_doc_uploaded_at || e.created_at > c.last_doc_uploaded_at),
    ).length;
    if (sentSinceUpload >= MAX_SENDS_BEFORE_CALL) {
      doToday.push({
        claim_id: c.claim_id, client_name: c.client_name,
        title: `הלקוח לא מגיב (${sentSinceUpload} תזכורות) — ליצור קשר טלפוני`,
        due_at: t.due_at, overdue_days: overdueDays(t.due_at!), escalation: true,
      });
      continue;
    }

    // Cooldown: the latest touch of ANY kind suppresses — a skip means
    // "not for the cooldown", same code path as a send (spec §5).
    const last = pair[0];
    if (last && now.getTime() - new Date(last.created_at).getTime() < rule.cooldownDays * DAY_MS) {
      continue;
    }

    const body = rule.build({
      firstName: c.client_name?.trim().split(/\s+/)[0] ?? null,
      blockingLabels: c.blocking_labels,
      uploadUrl: `${origin}/c/${c.access_token}`,
    });
    send.push({
      claim_id: c.claim_id, task_id: t.id, task_key: t.key!,
      client_name: c.client_name, tier: c.tier, reason: c.reason,
      overdue_days: overdueDays(t.due_at!), body,
      href: waHref(c.client_phone, body),
    });
  }

  // Task 5 adds here: per-claim daily cap, then ordering.
  return { send, doToday };
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/lib/outbound/queue.test.ts`
Expected: PASS (Task 4 describe blocks only).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/outbound/queue.ts web/src/lib/outbound/queue.test.ts
git commit -m "feat: outbound queue derivation — lanes, due filter, cooldown"
```

---

### Task 5: `queue.ts` — per-claim daily cap, give-up escalation edge, ordering

**Files:**
- Modify: `web/src/lib/outbound/queue.ts`
- Test: `web/src/lib/outbound/queue.test.ts` (append)

**Interfaces:**
- Consumes/Produces: unchanged from Task 4 — internal behavior only.

- [ ] **Step 1: Write the failing tests** (append)

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/outbound/queue.test.ts`
Expected: FAIL on the new describe blocks (cap not enforced, no ordering).

- [ ] **Step 3: Implement** — replace the `return { send, doToday };` tail of `buildQueue`:

```ts
  // ── One message per claim per day (spec §5 guard 1) ─────────────────────
  // A claim whose slot was used today (any key, sent or skipped) proposes
  // nothing more; among fresh candidates the most overdue wins, ties broken
  // by RULE_PRIORITY.
  const today = now.toISOString().slice(0, 10);
  const usedToday = new Set(
    events.filter((e) => e.created_at.slice(0, 10) === today).map((e) => e.claim_id),
  );
  const bestPerClaim = new Map<string, SendItem>();
  for (const item of send) {
    if (usedToday.has(item.claim_id)) continue;
    const cur = bestPerClaim.get(item.claim_id);
    if (
      !cur ||
      item.overdue_days > cur.overdue_days ||
      (item.overdue_days === cur.overdue_days &&
        RULE_PRIORITY.indexOf(item.task_key) < RULE_PRIORITY.indexOf(cur.task_key))
    ) {
      bestPerClaim.set(item.claim_id, item);
    }
  }

  // ── Ordering ────────────────────────────────────────────────────────────
  const tierOrd = (t: Tier | null) => (t ? TIER_ORDER[t] : Number.MAX_SAFE_INTEGER);
  const capped = [...bestPerClaim.values()].sort(
    (a, b) => {
      const ca = claimById.get(a.claim_id)!;
      const cb = claimById.get(b.claim_id)!;
      return tierOrd(ca.tier) - tierOrd(cb.tier) || cb.score - ca.score || b.overdue_days - a.overdue_days;
    },
  );
  doToday.sort((a, b) => b.overdue_days - a.overdue_days);

  return { send: capped, doToday };
```

(Adjust the Task 4 code so the pre-cap items accumulate into `send` and this block replaces the return — the intermediate array can be renamed `candidates` for clarity.)

- [ ] **Step 4: Run the full queue test file**

Run: `cd web && npx vitest run src/lib/outbound/queue.test.ts`
Expected: PASS — all describe blocks from Tasks 4 and 5.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/outbound/queue.ts web/src/lib/outbound/queue.test.ts
git commit -m "feat: outbound queue daily cap, give-up escalation, ordering"
```

---

### Task 6: `load.ts` — the I/O wrapper

**Files:**
- Create: `web/src/lib/outbound/load.ts`

**Interfaces:**
- Consumes: `buildQueue` + types (Tasks 4–5); `computeChecklist` from `@/lib/claims/checklist` (existing — signature `computeChecklist(claimType: string, docTypes: Set<string>, hasForm: boolean, checklistState: Record<string, boolean>, flags: {theft; lien; business_use; policy_activated; garage_network_rider})`); `createServiceClient` from `@/lib/supabase/service`; `type Brief` from `@/lib/brief/brief`.
- Produces (used by Task 8): `loadQueue(agentId: string, origin: string, brief: Brief | null): Promise<OutboundQueue | null>`

- [ ] **Step 1: Implement** (no unit test — I/O wrappers are untested in this repo, matching `brief.ts`; exercised in Task 8's live check)

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { computeChecklist } from "@/lib/claims/checklist";
import type { Brief } from "@/lib/brief/brief";
import {
  buildQueue,
  type OutboundEventRow,
  type OutboundQueue,
  type QueueClaim,
  type QueueTaskRow,
} from "./queue";

const DAY_MS = 86_400_000;
// Events window: must cover the longest cooldown and the give-up count.
// 60 days is comfortably past both; older events can't change the queue.
const EVENTS_WINDOW_DAYS = 60;

// Best-effort: returns null on ANY failure so the dashboard renders without
// the panel (the getOrCreateBrief contract). In particular a failed
// outbound_events read must NOT degrade to "no events" — that would propose
// sends with no cooldown data and risk double-chasing a client.
export async function loadQueue(
  agentId: string,
  origin: string,
  brief: Brief | null,
): Promise<OutboundQueue | null> {
  try {
    const svc = createServiceClient();
    const now = new Date();

    const { data: claims, error: claimsErr } = await svc
      .from("claims")
      .select(
        "id, client_name, client_phone, access_token, claim_type, checklist_state, theft, lien, business_use, policy_activated, garage_network_rider",
      )
      .eq("agent_id", agentId)
      .not("status", "in", "(closed,abandoned)");
    if (claimsErr) throw claimsErr;
    if (!claims || claims.length === 0) return { send: [], doToday: [] };
    const ids = claims.map((c) => c.id);

    const [tasksRes, docsRes, formsRes, eventsRes] = await Promise.all([
      svc.from("tasks")
        .select("id, claim_id, key, title, due_at, status, source")
        .in("claim_id", ids).neq("status", "done"),
      svc.from("claim_documents").select("claim_id, type, uploaded_at").in("claim_id", ids),
      svc.from("generated_forms").select("claim_id").in("claim_id", ids),
      svc.from("outbound_events")
        .select("claim_id, task_key, kind, created_at")
        .in("claim_id", ids)
        .gte("created_at", new Date(now.getTime() - EVENTS_WINDOW_DAYS * DAY_MS).toISOString()),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (docsRes.error) throw docsRes.error;
    if (formsRes.error) throw formsRes.error;
    if (eventsRes.error) {
      // Same failure-visibility rule as brief.ts: name the likely migration.
      console.error(
        `outbound queue: events read failed (${eventsRes.error.message}) — queue hidden. Check that migration 008_outbound_events.sql has been applied to this database.`,
      );
      return null;
    }

    const docsBy = new Map<string, { type: string; uploaded_at: string }[]>();
    for (const d of docsRes.data ?? []) {
      const list = docsBy.get(d.claim_id) ?? [];
      list.push({ type: d.type as string, uploaded_at: d.uploaded_at as string });
      docsBy.set(d.claim_id, list);
    }
    const formClaims = new Set((formsRes.data ?? []).map((f) => f.claim_id));
    const briefBy = new Map((brief?.items ?? []).map((i) => [i.claim_id, i]));

    const queueClaims: QueueClaim[] = claims.map((c) => {
      const docs = docsBy.get(c.id) ?? [];
      const checklist = computeChecklist(
        c.claim_type,
        new Set(docs.map((d) => d.type)),
        formClaims.has(c.id),
        (c.checklist_state as Record<string, boolean> | null) ?? {},
        {
          theft: !!c.theft, lien: !!c.lien, business_use: !!c.business_use,
          policy_activated: !!c.policy_activated, garage_network_rider: !!c.garage_network_rider,
        },
      );
      const b = briefBy.get(c.id);
      return {
        claim_id: c.id,
        client_name: c.client_name,
        client_phone: c.client_phone,
        access_token: c.access_token,
        blocking_labels: checklist.filter((i) => i.blocking && !i.done).map((i) => i.label),
        last_doc_uploaded_at: docs.length
          ? docs.map((d) => d.uploaded_at).reduce((a, b2) => (a > b2 ? a : b2))
          : null,
        tier: b?.tier ?? null,
        reason: b?.reason ?? null,
        score: b?.score ?? 0,
      };
    });

    return buildQueue({
      claims: queueClaims,
      tasks: (tasksRes.data ?? []) as QueueTaskRow[],
      events: (eventsRes.data ?? []) as OutboundEventRow[],
      origin,
      now,
    });
  } catch (err) {
    console.error("outbound queue failed:", err);
    return null;
  }
}
```

- [ ] **Step 2: Typecheck via build**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (If `computeChecklist`'s actual parameter shape differs, adapt the call — `web/src/lib/brief/facts.ts:49` is the reference call site.)

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/outbound/load.ts
git commit -m "feat: outbound queue I/O wrapper (best-effort, null on failure)"
```

---

### Task 7: `POST /api/outbound/events`

**Files:**
- Create: `web/src/app/api/outbound/events/route.ts`

**Interfaces:**
- Consumes: `SEND_RULES` (Task 3); `createClient` from `@/lib/supabase/server`; `createServiceClient` from `@/lib/supabase/service`. Table from Task 1.
- Produces: `POST` body `{ claim_id: string; task_id?: string; task_key: string; kind: "sent" | "skipped"; body?: string }` → `{ ok: true }`. Used by Task 8's panel.

- [ ] **Step 1: Implement** (pattern copied from `web/src/app/api/claims/[id]/notes/route.ts` — auth check, RLS ownership probe, service-client write)

```ts
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SEND_RULES } from "@/lib/outbound/rules";

// POST /api/outbound/events
// Body: { claim_id, task_id?, task_key, kind: 'sent' | 'skipped', body? }
// Records an outbound-queue decision. body_snapshot is stored only for
// kind='sent' — it is the audit copy of what actually went out (spec §3).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const claimId = typeof payload?.claim_id === "string" ? payload.claim_id : "";
  const taskId = typeof payload?.task_id === "string" ? payload.task_id : null;
  const taskKey = typeof payload?.task_key === "string" ? payload.task_key : "";
  const kind = payload?.kind;
  const body = typeof payload?.body === "string" ? payload.body : null;

  if (!claimId || !(taskKey in SEND_RULES) || (kind !== "sent" && kind !== "skipped")) {
    return Response.json(
      { error: "claim_id, known task_key, and kind ('sent' | 'skipped') required" },
      { status: 400 },
    );
  }

  // RLS ownership probe: auth-scoped select returns null unless this agent
  // owns the claim.
  const { data: claim } = await supabase.from("claims").select("id").eq("id", claimId).single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  // task_id is advisory (kept for the audit trail; FK ON DELETE SET NULL) —
  // verify it belongs to this claim rather than trusting the client.
  let verifiedTaskId: string | null = null;
  if (taskId) {
    const { data: t } = await supabase
      .from("tasks").select("id").eq("id", taskId).eq("claim_id", claimId).maybeSingle();
    verifiedTaskId = t?.id ?? null;
  }

  const svc = createServiceClient();
  const { error } = await svc.from("outbound_events").insert({
    claim_id: claimId,
    task_id: verifiedTaskId,
    task_key: taskKey,
    kind,
    recipient_kind: "client",
    channel: "whatsapp",
    actor: "agent",
    body_snapshot: kind === "sent" ? body : null,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/outbound/events/route.ts
git commit -m "feat: POST /api/outbound/events — record send/skip decisions"
```

---

### Task 8: `OutboundQueue.tsx` panel + dashboard wiring + brief button removal

**Files:**
- Create: `web/src/app/dashboard/OutboundQueue.tsx`
- Modify: `web/src/app/dashboard/page.tsx` (mount panel; hoist `agentRow` + `origin`)
- Modify: `web/src/app/dashboard/MorningBrief.tsx` (remove the inline chase button)

**Interfaces:**
- Consumes: `type OutboundQueue, SendItem, DoItem` (Tasks 4–5); `loadQueue` (Task 6); route (Task 7).
- Produces: `<OutboundQueue queue={queue} />` client component.

- [ ] **Step 1: Write `OutboundQueue.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DoItem, OutboundQueue as Queue, SendItem } from "@/lib/outbound/queue";

const TIER_BADGE: Record<string, string> = {
  act_now: "bg-red-100 text-red-800",
  this_week: "bg-amber-100 text-amber-800",
  waiting: "bg-zinc-100 text-zinc-700",
  ok: "bg-green-100 text-green-800",
};

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

function SendRow({ item }: { item: SendItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // TRAP: window.open must run synchronously in the click handler — any await
  // before it and the popup blocker eats the send. The event write is
  // best-effort; a dropped write costs a re-proposal tomorrow (absorbed by
  // the cooldown), a blocked window costs the agent the send.
  function send() {
    if (item.href) window.open(item.href, "_blank", "noopener,noreferrer");
    setBusy(true);
    void postEvent(item, "sent").finally(() => router.refresh());
  }
  function skip() {
    setBusy(true);
    void postEvent(item, "skipped").finally(() => router.refresh());
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/dashboard/${item.claim_id}`} className="font-medium text-zinc-900 hover:underline">
            {item.client_name ?? "ללא שם"}
          </Link>
          {item.tier && (
            <span className={`rounded px-1.5 py-0.5 text-xs ${TIER_BADGE[item.tier] ?? ""}`}>{item.reason}</span>
          )}
          {item.overdue_days > 0 && (
            <span className="text-xs text-red-600">באיחור {item.overdue_days} ימים</span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={send}
            disabled={busy || !item.href}
            title={item.href ? undefined : "מספר טלפון חסר או לא תקין"}
            className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            שלח בוואטסאפ ↗
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            דלג
          </button>
        </div>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-zinc-400">תצוגת הודעה</summary>
        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700" dir="rtl">
          {item.body}
        </pre>
      </details>
    </li>
  );
}

function DoRow({ item }: { item: DoItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <Link href={`/dashboard/${item.claim_id}`} className="text-sm text-zinc-900 hover:underline">
          <span className="font-medium">{item.client_name ?? "ללא שם"}</span>
          {" · "}
          <span className={item.escalation ? "text-amber-800" : ""}>{item.title}</span>
        </Link>
      </div>
      {item.overdue_days > 0 && (
        <span className="shrink-0 text-xs text-red-600">באיחור {item.overdue_days} ימים</span>
      )}
    </li>
  );
}

export default function OutboundQueue({ queue }: { queue: Queue }) {
  if (queue.send.length === 0 && queue.doToday.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4" dir="rtl">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">יוצא היום</h2>
      <div className="space-y-3">
        {queue.send.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50/40">
            <p className="px-3 pt-2 text-sm font-medium text-green-900">
              לשלוח היום ({queue.send.length})
            </p>
            <ul className="divide-y divide-zinc-100">
              {queue.send.map((i) => (
                <SendRow key={`${i.claim_id}:${i.task_key}`} item={i} />
              ))}
            </ul>
          </div>
        )}
        {queue.doToday.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50">
            <p className="px-3 pt-2 text-sm font-medium text-zinc-700">
              לטפל היום ({queue.doToday.length})
            </p>
            <ul className="divide-y divide-zinc-100">
              {queue.doToday.map((i, n) => (
                <DoRow key={`${i.claim_id}:${n}`} item={i} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into `page.tsx`**

In `web/src/app/dashboard/page.tsx`: hoist the `origin` computation (currently ~line 62) **above** the brief block; hoist `agentRow` out of the `try` so the queue can use it; load and render the queue:

```tsx
import OutboundQueue from "./OutboundQueue";
import { loadQueue } from "@/lib/outbound/load";
```

```tsx
  // (origin computation moved here, before the brief block — unchanged code)

  let brief = null;
  let queue = null;
  try {
    const svc = createServiceClient();
    const { data: agentRow } = await svc
      .from("agents").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (agentRow) {
      brief = await getOrCreateBrief(agentRow.id);
      // The queue takes the brief only as an ordering signal — a null brief
      // (AI down / cache broken) must not take the send queue down with it.
      queue = await loadQueue(agentRow.id, origin, brief);
    }
  } catch {
    brief = null;
    queue = null;
  }
```

```tsx
        {brief && <MorningBrief brief={brief} origin={origin} />}
        {queue && <OutboundQueue queue={queue} />}
```

- [ ] **Step 3: Remove the brief's inline chase button**

In `web/src/app/dashboard/MorningBrief.tsx`: delete the `chaseHref` import, the `wa` const in `ItemRow` (lines ~17–24), and the `{wa && (<a …>בקש מסמכים בוואטסאפ ↗</a>)}` block (~lines 48–57). The queue is now the single send surface (spec §6). `origin` prop becomes unused — remove it from `ItemRow` and from the `MorningBrief` props, and drop `origin={origin}` at the `page.tsx` call site.

- [ ] **Step 4: Full gate**

Run: `cd web && npx vitest run && npm run lint && npm run build`
Expected: all tests pass, lint clean, build succeeds.

- [ ] **Step 5: Live check** (dev server against dev Supabase, per the preview workflow)

Start the dev server; log in; confirm: (a) a claim with an overdue `chase_missing_docs` task shows in "לשלוח היום" with the message preview; (b) דלג removes it on refresh and inserts a `skipped` row in `outbound_events`; (c) the brief rows no longer show a WhatsApp button; (d) a claim with an overdue `open_claim_with_insurer` task shows in "לטפל היום" linking to the cockpit.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/dashboard/OutboundQueue.tsx web/src/app/dashboard/page.tsx web/src/app/dashboard/MorningBrief.tsx
git commit -m "feat: two-lane outbound queue panel; brief chase button removed"
```

---

## Post-plan notes

- **PR:** push `feat/outbound-queue`, open a PR per the repo's standing rule; the doc-sync Action will reconcile `docs/status.md` etc. **Flag migration 008 in the PR body** — it must be applied to prod (`claims-pilot`) before/with merge (the two-place trap).
- **Out of scope, per spec §7:** cron, auto-send, BSP, third-party contacts, AI drafting, delivery receipts, quiet hours. Do not add any of these "while we're here."
