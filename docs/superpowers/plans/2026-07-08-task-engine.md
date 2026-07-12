# Task Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static per-track checklist into a reactive task engine: events (track confirm, milestone tick, doc upload, submit) spawn dated action-tasks, auto-complete satisfied ones, and advance claim status — surfaced on the claim cockpit and dashboard worklist.

**Architecture:** Hybrid model per the spec (`docs/superpowers/specs/2026-07-08-task-engine-design.md`): doc/form checklist items stay **derived** (never stored as tasks); milestones + dated action-tasks become persisted `tasks` rows. A **pure engine** (`advanceTasks`) computes spawn/complete/status mutations from declarative per-track rules; a thin **runner** does the Supabase I/O and is called inline (best-effort) from the four existing mutation routes. No cron — "overdue" is computed at read time.

**Tech Stack:** Next.js 16 (App Router, async `params`), TypeScript 5, Supabase (Postgres + RLS), Tailwind v4 RTL, Vitest (new — no test runner exists yet).

## Global Constraints

- **Working directory for all commands: `web/`** (the Next.js app lives there). All file paths below are repo-relative.
- **Next.js is v16** — async `params`/`cookies()`/`headers()`. Per `web/AGENTS.md`: read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next-specific code.
- **English code identifiers, Hebrew UI strings** (keep the exact Hebrew task titles from this plan — they're domain-reviewed).
- **Supabase is NOT provisioned** in dev: unit tests must be pure (no network); `npm run build` must pass without env keys.
- **Branch `feat/task-engine`** off `main`; never commit to `main`. PR at the end; do not self-merge. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The `tasks` table already exists in `web/db/schema.sql:79` with `task_status` enum (`todo/in_progress/blocked/done`), RLS via `claim_belongs_to_me`, and grants. Migration 006 only **adds columns/indexes**.
- Engine failures must never fail the mutation that triggered them (best-effort `try/catch` in the runner, not in routes).

---

### Task 1: Vitest test infrastructure

**Files:**
- Modify: `web/package.json` (add `test` script; `vitest` devDependency via npm)
- Create: `web/vitest.config.ts`
- Create: `web/src/lib/tasks/smoke.test.ts` (deleted again in Task 3)

**Interfaces:**
- Produces: `npm test` (= `vitest run`) usable by all later tasks; `@/` path alias resolving to `web/src/` inside tests.

- [ ] **Step 1: Install vitest**

Run (in `web/`): `npm install -D vitest`
Expected: `vitest` added to `devDependencies` in `web/package.json`.

- [ ] **Step 2: Add the test script**

In `web/package.json`, add to `"scripts"`:

```json
    "test": "vitest run"
```

- [ ] **Step 3: Create vitest config with the `@` alias**

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // mirror tsconfig "@/*" → "./src/*" so tests import app code the same way
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Write a smoke test proving the alias works**

Create `web/src/lib/tasks/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeChecklist } from "@/lib/claims/checklist";

describe("test infra", () => {
  it("resolves the @ alias and runs", () => {
    const items = computeChecklist("unknown", new Set(), false, {}, {
      theft: false, lien: false, business_use: false,
      policy_activated: false, garage_network_rider: false,
    });
    expect(items.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/tasks/smoke.test.ts
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Migration 006 — task-engine columns

**Files:**
- Create: `web/db/migrations/006_tasks_engine.sql`
- Modify: `docs/status.md` (add migration 006 to the provisioning list, step 3)

**Interfaces:**
- Produces: `tasks.key`, `tasks.source`, `tasks.note`, `tasks.completed_at` columns; partial unique index `(claim_id, key) where key is not null and status <> 'done'` — the idempotency backstop the runner (Task 5) relies on.

- [ ] **Step 1: Write the migration**

Create `web/db/migrations/006_tasks_engine.sql`:

```sql
-- 006: task-engine columns on the (previously dormant) tasks table.
-- key:    stable template identifier (e.g. 'chase_appraiser'); null for manual tasks.
-- source: 'template' (engine-spawned) | 'manual' (agent-created).
alter table tasks
  add column if not exists key text,
  add column if not exists source text not null default 'template',
  add column if not exists note text,
  add column if not exists completed_at timestamptz;

create index if not exists tasks_claim_status_due_idx
  on tasks (claim_id, status, due_at);

-- At most one OPEN template task per (claim, key). A 'done' task frees the key,
-- allowing a justified re-spawn (spec §10). Races between concurrent requests
-- resolve here as a 23505 the runner ignores.
create unique index if not exists tasks_claim_key_open_uniq
  on tasks (claim_id, key)
  where key is not null and status <> 'done';
```

- [ ] **Step 2: Update the provisioning breadcrumb**

In `docs/status.md`, in the "Next step: provision Supabase" numbered list (step 3, the sentence listing migrations `001`–`005`), append after the `005` clause:

```
, then `web/db/migrations/006_tasks_engine.sql` (task-engine columns + idempotency index on `tasks`)
```

- [ ] **Step 3: Sanity-check the SQL is syntactically valid**

No live DB exists. Verify by inspection against `web/db/schema.sql` that: the `tasks` table name matches, `task_status` values match (`'done'`), and every statement uses `if not exists`. Expected: all three hold.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/006_tasks_engine.sql ../docs/status.md
git commit -m "feat: migration 006 — task-engine columns + open-task unique index"
```

---

### Task 3: Types + per-track task templates (TDD)

**Files:**
- Create: `web/src/lib/tasks/types.ts`
- Create: `web/src/lib/tasks/templates.ts`
- Test: `web/src/lib/tasks/templates.test.ts`
- Delete: `web/src/lib/tasks/smoke.test.ts`

**Interfaces:**
- Consumes: `ComputedItem` from `@/lib/claims/checklist` (fields used: `kind`, `docType`, `key`, `section`, `mandatory`, `blocking`, `done`).
- Produces (used by Tasks 4–9):
  - `types.ts`: `ClaimType`, `ClaimStatus`, `TaskStatus`, `TaskRow { id, key, title, status, due_at, source }`, `TaskSpawn { key, title, track, due_at }`, `EngineEvent` (discriminated union), `EngineInput`, `EngineResult { spawn, complete, statusAdvance }`, `STATUS_ORDER`.
  - `templates.ts`: `DUE_OFFSETS: Record<string, number>`, `RuleCtx`, `TaskRule`, `TASK_RULES: TaskRule[]`.

- [ ] **Step 1: Write the failing template tests**

Create `web/src/lib/tasks/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TASK_RULES, DUE_OFFSETS } from "./templates";

describe("TASK_RULES", () => {
  it("has a positive integer due offset for every rule", () => {
    for (const rule of TASK_RULES) {
      expect(rule.dueDays, rule.key).toBeGreaterThan(0);
      expect(Number.isInteger(rule.dueDays), rule.key).toBe(true);
      expect(DUE_OFFSETS[rule.key], rule.key).toBe(rule.dueDays);
    }
  });

  it("has unique keys within each track scope", () => {
    // 'all' rules must not collide with any track-specific rule; track rules
    // must be unique per track (the same key MAY appear on different tracks).
    const allKeys = new Set(
      TASK_RULES.filter((r) => r.track === "all").map((r) => r.key),
    );
    const perTrack = new Map<string, Set<string>>();
    for (const r of TASK_RULES) {
      if (r.track === "all") continue;
      expect(allKeys.has(r.key), r.key).toBe(false);
      const seen = perTrack.get(r.track) ?? new Set();
      expect(seen.has(r.key), `${r.track}/${r.key}`).toBe(false);
      seen.add(r.key);
      perTrack.set(r.track, seen);
    }
  });

  it("only targets valid tracks", () => {
    const valid = new Set([
      "all", "own_policy", "third_party_report", "third_party_settlement",
    ]);
    for (const rule of TASK_RULES) expect(valid.has(rule.track), rule.key).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './templates'` (or equivalent resolve error).

- [ ] **Step 3: Write `types.ts`**

Create `web/src/lib/tasks/types.ts`:

```ts
import type { ComputedItem } from "@/lib/claims/checklist";

export type ClaimType =
  | "own_policy"
  | "third_party_report"
  | "third_party_settlement"
  | "unknown";

export type ClaimStatus =
  | "created"
  | "in_progress"
  | "submitted"
  | "classified"
  | "form_generated"
  | "checklist_active"
  | "closed"
  | "abandoned";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

// Forward-only lifecycle ordering; the engine never proposes a move to a
// lower ordinal. 'abandoned' is terminal — the engine never advances from it.
export const STATUS_ORDER: Record<ClaimStatus, number> = {
  created: 0,
  in_progress: 1,
  submitted: 2,
  classified: 3,
  form_generated: 4,
  checklist_active: 5,
  closed: 6,
  abandoned: 99,
};

export type TaskRow = {
  id: string;
  key: string | null; // null = manual task, never auto-completed
  title: string;
  status: TaskStatus;
  due_at: string | null;
  source: string; // 'template' | 'manual'
};

export type TaskSpawn = {
  key: string;
  title: string;
  track: Exclude<ClaimType, "unknown"> | null; // task_track enum has no 'unknown'
  due_at: string; // ISO
};

export type EngineEvent =
  | { type: "claim_submitted" }
  | { type: "track_confirmed" }
  | { type: "milestone_ticked"; key: string; done: boolean }
  | { type: "doc_uploaded"; docType: string };

export type EngineInput = {
  claim: {
    claimType: ClaimType;
    status: ClaimStatus;
    atFaultInsurer: string | null;
  };
  checklist: ComputedItem[]; // computed AFTER the event's own DB mutation
  hasGeneratedForm: boolean;
  openTasks: TaskRow[]; // status != 'done'
  event: EngineEvent;
  now: Date;
};

export type EngineResult = {
  spawn: TaskSpawn[];
  complete: string[]; // ids of open tasks to mark done
  statusAdvance: ClaimStatus | null;
};
```

- [ ] **Step 4: Write `templates.ts`**

Create `web/src/lib/tasks/templates.ts`:

```ts
import type { ClaimType, EngineEvent } from "./types";

// Relative due-date offsets in days. FIELD ASSUMPTIONS (regulatory-clock.md §3),
// not regulated SLAs — tune with the design partner.
export const DUE_OFFSETS: Record<string, number> = {
  chase_missing_docs: 3,
  open_claim_with_insurer: 2,
  chase_appraiser: 3,
  follow_up_insurer: 14,
  get_tp_insurer: 2,
  collect_private_report_docs: 5,
  submit_to_tp_insurer: 2,
  follow_up_tp_insurer: 14,
  request_settlement_approval: 2,
  follow_up_approval: 5,
  schedule_garage: 3,
  follow_up_repair: 7,
};

// Read-only view of the claim the rules can query. Built by the engine from
// the computed checklist — rules never see raw rows.
export type RuleCtx = {
  claimType: ClaimType;
  atFaultInsurer: string | null;
  hasGeneratedForm: boolean;
  docDone: (docType: string) => boolean;
  milestoneDone: (key: string) => boolean;
  blockingMissing: () => boolean;
  // client-facing base docs still missing (kind 'doc' only — the generated
  // form is the system's job, not the client's)
  mandatoryBaseDocsMissing: () => boolean;
  blockingSectionMissing: (section: "base" | "late") => boolean;
};

export type TaskRule = {
  key: string;
  title: string; // Hebrew — shown verbatim in the UI
  dueDays: number;
  track: ClaimType | "all";
  spawnOn: (event: EngineEvent, ctx: RuleCtx) => boolean;
  completeWhen: (ctx: RuleCtx) => boolean;
};

export const TASK_RULES: TaskRule[] = [
  // ── all tracks ──────────────────────────────────────────────────────────
  {
    key: "chase_missing_docs",
    title: "להשלים מסמכים חסרים מהלקוח",
    dueDays: DUE_OFFSETS.chase_missing_docs,
    track: "all",
    // At submit the track is still 'unknown' (whose items are non-blocking),
    // so this keys off mandatory base DOCS, not blocking items. Re-evaluated
    // at track confirm, when the fuller track checklist kicks in.
    spawnOn: (e, ctx) =>
      (e.type === "claim_submitted" || e.type === "track_confirmed") &&
      ctx.mandatoryBaseDocsMissing(),
    completeWhen: (ctx) => !ctx.mandatoryBaseDocsMissing(),
  },

  // ── own_policy ──────────────────────────────────────────────────────────
  {
    key: "open_claim_with_insurer",
    title: "פתיחת תביעה מול מבטח הלקוח",
    dueDays: DUE_OFFSETS.open_claim_with_insurer,
    track: "own_policy",
    spawnOn: (e) => e.type === "track_confirmed",
    completeWhen: (ctx) => ctx.milestoneDone("submitted_to_insurer"),
  },
  {
    key: "chase_appraiser",
    title: "לוודא תיאום שמאי / דוח שמאי",
    dueDays: DUE_OFFSETS.chase_appraiser,
    track: "own_policy",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "car_at_garage" && e.done,
    completeWhen: (ctx) => ctx.docDone("appraiser_report"),
  },
  {
    key: "follow_up_insurer",
    title: "מעקב תשובת מבטח",
    dueDays: DUE_OFFSETS.follow_up_insurer,
    track: "own_policy",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "submitted_to_insurer" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("payment_received"),
  },

  // ── third_party_report ──────────────────────────────────────────────────
  {
    key: "get_tp_insurer",
    title: "להשיג פרטי מבטח צד ג'",
    dueDays: DUE_OFFSETS.get_tp_insurer,
    track: "third_party_report",
    spawnOn: (e, ctx) => e.type === "track_confirmed" && !ctx.atFaultInsurer,
    completeWhen: (ctx) => !!ctx.atFaultInsurer,
  },
  {
    key: "chase_appraiser",
    title: "לוודא דוח שמאי",
    dueDays: DUE_OFFSETS.chase_appraiser,
    track: "third_party_report",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "car_at_garage" && e.done,
    completeWhen: (ctx) => ctx.docDone("appraiser_report"),
  },
  {
    key: "collect_private_report_docs",
    title: 'לאסוף מסמכי "דוח פרטי" (קבלה, אישור אי-הגשה, עבר ביטוחי)',
    dueDays: DUE_OFFSETS.collect_private_report_docs,
    track: "third_party_report",
    spawnOn: (e) => e.type === "doc_uploaded" && e.docType === "garage_invoice",
    completeWhen: (ctx) => !ctx.blockingSectionMissing("late"),
  },
  {
    key: "submit_to_tp_insurer",
    title: "להגיש למבטח צד ג'",
    dueDays: DUE_OFFSETS.submit_to_tp_insurer,
    track: "third_party_report",
    // condition-triggered: fires on whatever event clears the last blocker
    spawnOn: (_e, ctx) => !ctx.blockingMissing(),
    completeWhen: (ctx) => ctx.milestoneDone("submitted_to_tp_insurer"),
  },
  {
    key: "follow_up_tp_insurer",
    title: "מעקב אישור / דחייה / השלמות",
    dueDays: DUE_OFFSETS.follow_up_tp_insurer,
    track: "third_party_report",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "submitted_to_tp_insurer" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("payment_received"),
  },

  // ── third_party_settlement ──────────────────────────────────────────────
  {
    key: "request_settlement_approval",
    title: "לשלוח בקשת אישור הסדר למבטח צד ג'",
    dueDays: DUE_OFFSETS.request_settlement_approval,
    track: "third_party_settlement",
    spawnOn: (e) => e.type === "track_confirmed",
    completeWhen: (ctx) => ctx.milestoneDone("approval_requested"),
  },
  {
    key: "follow_up_approval",
    title: "מעקב אישור מסלול הסדר",
    dueDays: DUE_OFFSETS.follow_up_approval,
    track: "third_party_settlement",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "approval_requested" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("route_approved"),
  },
  {
    key: "schedule_garage",
    title: "לתאם כניסה למוסך הסדר",
    dueDays: DUE_OFFSETS.schedule_garage,
    track: "third_party_settlement",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "route_approved" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("car_at_garage"),
  },
  {
    key: "follow_up_repair",
    title: "מעקב סיום תיקון",
    dueDays: DUE_OFFSETS.follow_up_repair,
    track: "third_party_settlement",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "car_at_garage" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("payment_received"),
  },
];
```

- [ ] **Step 5: Delete the smoke test, run**

Delete `web/src/lib/tasks/smoke.test.ts`.
Run: `npm test`
Expected: PASS (3 tests in `templates.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tasks/types.ts src/lib/tasks/templates.ts src/lib/tasks/templates.test.ts
git rm src/lib/tasks/smoke.test.ts
git commit -m "feat: task-engine types + declarative per-track task templates"
```

---

### Task 4: Pure engine — `advanceTasks` (TDD)

**Files:**
- Create: `web/src/lib/tasks/engine.ts`
- Test: `web/src/lib/tasks/engine.test.ts`

**Interfaces:**
- Consumes: `TASK_RULES`, `RuleCtx` from `./templates`; all types from `./types`; `ComputedItem` from `@/lib/claims/checklist`.
- Produces: `advanceTasks(input: EngineInput): EngineResult` — the single pure entry point the runner (Task 5) calls.

**Status-advance semantics (locked here, tested below):**
| Event | Candidate status |
|---|---|
| `claim_submitted` | `submitted` |
| `track_confirmed` | `form_generated` if a generated form exists, else `classified` |
| `milestone_ticked` (done) | `closed` if key = `payment_received` (preserves current checklist-route behavior), else `checklist_active` |
| `doc_uploaded` | none |

Advance only if the candidate's `STATUS_ORDER` exceeds the current status; never from `closed`/`abandoned`. Task spawns alone do NOT advance status (so confirming a track lands on `classified`, not `checklist_active`).

- [ ] **Step 1: Write the failing engine tests**

Create `web/src/lib/tasks/engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeChecklist, type ComputedItem } from "@/lib/claims/checklist";
import { advanceTasks } from "./engine";
import type { EngineEvent, EngineInput, TaskRow } from "./types";

const NOW = new Date("2026-07-08T10:00:00Z");
const DAY = 86_400_000;
const FLAGS = {
  theft: false, lien: false, business_use: false,
  policy_activated: false, garage_network_rider: false,
};

function checklist(
  claimType: string,
  docs: string[] = [],
  hasForm = false,
  state: Record<string, boolean> = {},
): ComputedItem[] {
  return computeChecklist(claimType, new Set(docs), hasForm, state, FLAGS);
}

function task(over: Partial<TaskRow> & { key: string }): TaskRow {
  return {
    id: `id-${over.key}`, title: "t", status: "todo",
    due_at: null, source: "template", ...over,
  };
}

function run(over: {
  claimType?: EngineInput["claim"]["claimType"];
  status?: EngineInput["claim"]["status"];
  atFaultInsurer?: string | null;
  docs?: string[];
  hasForm?: boolean;
  state?: Record<string, boolean>;
  openTasks?: TaskRow[];
  event: EngineEvent;
}) {
  const claimType = over.claimType ?? "own_policy";
  return advanceTasks({
    claim: {
      claimType,
      status: over.status ?? "classified",
      atFaultInsurer: over.atFaultInsurer ?? null,
    },
    checklist: checklist(claimType, over.docs, over.hasForm ?? false, over.state ?? {}),
    hasGeneratedForm: over.hasForm ?? false,
    openTasks: over.openTasks ?? [],
    event: over.event,
    now: NOW,
  });
}

describe("spawning", () => {
  it("track_confirmed on own_policy spawns open_claim_with_insurer due +2d", () => {
    const r = run({ event: { type: "track_confirmed" } });
    const t = r.spawn.find((s) => s.key === "open_claim_with_insurer");
    expect(t).toBeDefined();
    expect(t!.track).toBe("own_policy");
    expect(new Date(t!.due_at).getTime()).toBe(NOW.getTime() + 2 * DAY);
  });

  it("track_confirmed on TP-report without at-fault insurer spawns get_tp_insurer", () => {
    const r = run({ claimType: "third_party_report", event: { type: "track_confirmed" } });
    expect(r.spawn.some((s) => s.key === "get_tp_insurer")).toBe(true);
  });

  it("track_confirmed on TP-report WITH at-fault insurer does not spawn get_tp_insurer", () => {
    const r = run({
      claimType: "third_party_report", atFaultInsurer: "clal",
      event: { type: "track_confirmed" },
    });
    expect(r.spawn.some((s) => s.key === "get_tp_insurer")).toBe(false);
  });

  it("claim_submitted on an unclassified claim with missing base docs spawns chase_missing_docs with track null", () => {
    const r = run({ claimType: "unknown", status: "in_progress", event: { type: "claim_submitted" } });
    const t = r.spawn.find((s) => s.key === "chase_missing_docs");
    expect(t).toBeDefined();
    expect(t!.track).toBeNull(); // task_track enum has no 'unknown'
  });

  it("claim_submitted with all base docs present spawns nothing", () => {
    const r = run({
      claimType: "unknown", status: "in_progress",
      docs: ["drivers_license", "vehicle_reg", "car_photo"],
      event: { type: "claim_submitted" },
    });
    expect(r.spawn).toEqual([]);
  });

  it("condition-triggered submit_to_tp_insurer fires on the doc upload that clears the last blocker", () => {
    const r = run({
      claimType: "third_party_report",
      docs: [
        "vehicle_reg", "car_photo", "demand_form", "appraiser_report",
        "garage_invoice", "repair_receipt", "no_claim_confirmation",
      ],
      hasForm: true,
      event: { type: "doc_uploaded", docType: "repair_receipt" },
    });
    expect(r.spawn.some((s) => s.key === "submit_to_tp_insurer")).toBe(true);
  });

  it("uploading an ordinary doc spawns nothing (hybrid boundary: docs are never tasks)", () => {
    const r = run({ event: { type: "doc_uploaded", docType: "drivers_license" } });
    expect(r.spawn).toEqual([]);
  });
});

describe("idempotency", () => {
  it("does not spawn when an open task with the same key exists", () => {
    const r = run({
      event: { type: "track_confirmed" },
      openTasks: [task({ key: "open_claim_with_insurer" })],
    });
    expect(r.spawn.some((s) => s.key === "open_claim_with_insurer")).toBe(false);
  });

  it("re-spawns after the previous task was done, if the condition still fails (spec §10)", () => {
    // openTasks excludes done tasks — a freed key spawns again on replay
    const r = run({ event: { type: "track_confirmed" }, openTasks: [] });
    expect(r.spawn.some((s) => s.key === "open_claim_with_insurer")).toBe(true);
  });

  it("never spawns a task whose completion condition already holds", () => {
    const r = run({
      state: { car_at_garage: true },
      docs: ["appraiser_report"],
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.spawn.some((s) => s.key === "chase_appraiser")).toBe(false);
  });
});

describe("auto-complete", () => {
  it("completes chase_appraiser when the appraiser report lands", () => {
    const open = task({ key: "chase_appraiser", id: "t-1" });
    const r = run({
      docs: ["appraiser_report"],
      openTasks: [open],
      event: { type: "doc_uploaded", docType: "appraiser_report" },
    });
    expect(r.complete).toContain("t-1");
  });

  it("never auto-completes manual tasks (key null)", () => {
    const manual: TaskRow = {
      id: "m-1", key: null, title: "ידני", status: "todo", due_at: null, source: "manual",
    };
    const r = run({
      docs: ["appraiser_report"],
      openTasks: [manual],
      event: { type: "doc_uploaded", docType: "appraiser_report" },
    });
    expect(r.complete).toEqual([]);
  });

  it("settlement chain: approval_requested tick completes the request task and spawns follow-up", () => {
    const open = task({ key: "request_settlement_approval", id: "t-req" });
    const r = run({
      claimType: "third_party_settlement",
      state: { approval_requested: true },
      openTasks: [open],
      event: { type: "milestone_ticked", key: "approval_requested", done: true },
    });
    expect(r.complete).toContain("t-req");
    expect(r.spawn.some((s) => s.key === "follow_up_approval")).toBe(true);
  });
});

describe("status advance", () => {
  it("claim_submitted advances to submitted", () => {
    const r = run({ claimType: "unknown", status: "in_progress", event: { type: "claim_submitted" } });
    expect(r.statusAdvance).toBe("submitted");
  });

  it("track_confirmed advances submitted → classified when no form exists", () => {
    const r = run({ status: "submitted", event: { type: "track_confirmed" } });
    expect(r.statusAdvance).toBe("classified");
  });

  it("track_confirmed advances to form_generated when a form exists", () => {
    const r = run({ status: "submitted", hasForm: true, event: { type: "track_confirmed" } });
    expect(r.statusAdvance).toBe("form_generated");
  });

  it("milestone tick advances to checklist_active", () => {
    const r = run({
      status: "classified",
      state: { car_at_garage: true },
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.statusAdvance).toBe("checklist_active");
  });

  it("payment_received tick closes the claim", () => {
    const r = run({
      status: "checklist_active",
      state: { payment_received: true },
      event: { type: "milestone_ticked", key: "payment_received", done: true },
    });
    expect(r.statusAdvance).toBe("closed");
  });

  it("is forward-only: track_confirmed on a checklist_active claim does not regress", () => {
    const r = run({ status: "checklist_active", event: { type: "track_confirmed" } });
    expect(r.statusAdvance).toBeNull();
  });

  it("unticking a milestone never changes status", () => {
    const r = run({
      status: "checklist_active",
      event: { type: "milestone_ticked", key: "car_at_garage", done: false },
    });
    expect(r.statusAdvance).toBeNull();
  });

  it("doc uploads never change status", () => {
    const r = run({ status: "submitted", event: { type: "doc_uploaded", docType: "car_photo" } });
    expect(r.statusAdvance).toBeNull();
  });

  it("never advances a closed claim", () => {
    const r = run({
      status: "closed",
      state: { car_at_garage: true },
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.statusAdvance).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Implement the engine**

Create `web/src/lib/tasks/engine.ts`:

```ts
import { TASK_RULES, type RuleCtx } from "./templates";
import {
  STATUS_ORDER,
  type ClaimStatus,
  type EngineInput,
  type EngineResult,
  type TaskSpawn,
} from "./types";

const DAY_MS = 86_400_000;

function buildRuleCtx(input: EngineInput): RuleCtx {
  const { checklist } = input;
  const docDone = new Map<string, boolean>();
  const milestoneDone = new Map<string, boolean>();
  for (const item of checklist) {
    if (item.kind === "doc" && item.docType) docDone.set(item.docType, item.done);
    if (item.kind === "milestone") milestoneDone.set(item.key, item.done);
  }
  return {
    claimType: input.claim.claimType,
    atFaultInsurer: input.claim.atFaultInsurer,
    hasGeneratedForm: input.hasGeneratedForm,
    docDone: (t) => docDone.get(t) === true,
    milestoneDone: (k) => milestoneDone.get(k) === true,
    blockingMissing: () => checklist.some((i) => i.blocking && !i.done),
    mandatoryBaseDocsMissing: () =>
      checklist.some(
        (i) => i.section === "base" && i.kind === "doc" && i.mandatory && !i.done,
      ),
    blockingSectionMissing: (section) =>
      checklist.some((i) => i.section === section && i.blocking && !i.done),
  };
}

// Pure + idempotent: same input → same output; an open task with a rule's key
// suppresses its re-spawn, so replayed events are no-ops.
export function advanceTasks(input: EngineInput): EngineResult {
  const { claim, event, openTasks, now } = input;
  const ctx = buildRuleCtx(input);

  const rules = TASK_RULES.filter(
    (r) => r.track === "all" || r.track === claim.claimType,
  );
  const ruleByKey = new Map(rules.map((r) => [r.key, r]));

  // 1 · auto-complete open template tasks whose condition now holds.
  //     Manual tasks (key null) are the agent's own — never auto-touched.
  const complete: string[] = [];
  for (const t of openTasks) {
    if (!t.key) continue;
    const rule = ruleByKey.get(t.key);
    if (rule?.completeWhen(ctx)) complete.push(t.id);
  }

  // 2 · spawn. Skip if an open task holds the key (idempotency) or the
  //     completion condition already holds (never spawn satisfied work).
  const openKeys = new Set(openTasks.filter((t) => t.key).map((t) => t.key!));
  const spawn: TaskSpawn[] = [];
  for (const rule of rules) {
    if (openKeys.has(rule.key)) continue;
    if (!rule.spawnOn(event, ctx)) continue;
    if (rule.completeWhen(ctx)) continue;
    spawn.push({
      key: rule.key,
      title: rule.title,
      track: claim.claimType === "unknown" ? null : claim.claimType,
      due_at: new Date(now.getTime() + rule.dueDays * DAY_MS).toISOString(),
    });
  }

  // 3 · status advance — forward-only, event-gated (see plan table).
  let candidate: ClaimStatus | null = null;
  switch (event.type) {
    case "claim_submitted":
      candidate = "submitted";
      break;
    case "track_confirmed":
      candidate = input.hasGeneratedForm ? "form_generated" : "classified";
      break;
    case "milestone_ticked":
      if (event.done) {
        candidate = event.key === "payment_received" ? "closed" : "checklist_active";
      }
      break;
    case "doc_uploaded":
      break;
  }
  const terminal = claim.status === "closed" || claim.status === "abandoned";
  const statusAdvance =
    !terminal && candidate && STATUS_ORDER[candidate] > STATUS_ORDER[claim.status]
      ? candidate
      : null;

  return { spawn, complete, statusAdvance };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — all `engine.test.ts` + `templates.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks/engine.ts src/lib/tasks/engine.test.ts
git commit -m "feat: pure task engine — spawn/auto-complete/status-advance"
```

---

### Task 5: Runner — Supabase I/O wrapper

**Files:**
- Create: `web/src/lib/tasks/runner.ts`

**Interfaces:**
- Consumes: `advanceTasks` (Task 4), `computeChecklist` from `@/lib/claims/checklist`, `createServiceClient` from `@/lib/supabase/service`.
- Produces: `runEngine(claimId: string, event: EngineEvent): Promise<{ status: ClaimStatus } | null>` — the one-liner routes call. Best-effort: catches everything, returns `null` on failure.

No unit test (pure I/O against Supabase, which isn't provisioned); correctness is covered by the pure engine tests + type-check + build. Keep ALL logic in the engine — the runner only fetches, calls, and writes.

- [ ] **Step 1: Implement the runner**

Create `web/src/lib/tasks/runner.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { computeChecklist } from "@/lib/claims/checklist";
import { advanceTasks } from "./engine";
import {
  STATUS_ORDER,
  type ClaimStatus,
  type ClaimType,
  type EngineEvent,
  type TaskRow,
} from "./types";

// Fetch → advanceTasks (pure) → apply. Called inline from mutation routes.
// Best-effort by contract: a task-engine failure must never fail the mutation
// that triggered it, so this catches everything and returns null.
export async function runEngine(
  claimId: string,
  event: EngineEvent,
): Promise<{ status: ClaimStatus } | null> {
  try {
    const svc = createServiceClient();

    const [{ data: claim }, { data: docs }, { count: formCount }, { data: taskRows }] =
      await Promise.all([
        svc
          .from("claims")
          .select(
            "id, claim_type, status, at_fault_insurer, checklist_state, submitted_at, theft, lien, business_use, policy_activated, garage_network_rider",
          )
          .eq("id", claimId)
          .single(),
        svc.from("claim_documents").select("type").eq("claim_id", claimId),
        svc
          .from("generated_forms")
          .select("id", { count: "exact", head: true })
          .eq("claim_id", claimId),
        svc
          .from("tasks")
          .select("id, key, title, status, due_at, source")
          .eq("claim_id", claimId)
          .neq("status", "done"),
      ]);
    if (!claim) return null;

    const hasForm = (formCount ?? 0) > 0;
    const checklist = computeChecklist(
      claim.claim_type,
      new Set((docs ?? []).map((d) => d.type as string)),
      hasForm,
      (claim.checklist_state as Record<string, boolean> | null) ?? {},
      {
        theft: !!claim.theft,
        lien: !!claim.lien,
        business_use: !!claim.business_use,
        policy_activated: !!claim.policy_activated,
        garage_network_rider: !!claim.garage_network_rider,
      },
    );

    const result = advanceTasks({
      claim: {
        claimType: claim.claim_type as ClaimType,
        status: claim.status as ClaimStatus,
        atFaultInsurer: claim.at_fault_insurer ?? null,
      },
      checklist,
      hasGeneratedForm: hasForm,
      openTasks: (taskRows ?? []) as TaskRow[],
      event,
      now: new Date(),
    });

    const events: { claim_id: string; type: string; payload_json: unknown }[] = [];

    for (const s of result.spawn) {
      // The partial unique index backstops concurrent requests: a duplicate
      // insert fails with 23505 and we simply skip its event row.
      const { error } = await svc.from("tasks").insert({
        claim_id: claimId,
        key: s.key,
        title: s.title,
        track: s.track,
        due_at: s.due_at,
        source: "template",
      });
      if (!error) {
        events.push({
          claim_id: claimId,
          type: "task_spawned",
          payload_json: { key: s.key, due_at: s.due_at },
        });
      }
    }

    if (result.complete.length) {
      const { error } = await svc
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .in("id", result.complete);
      if (!error) {
        for (const id of result.complete) {
          events.push({
            claim_id: claimId,
            type: "task_completed",
            payload_json: { task_id: id },
          });
        }
      }
    }

    let status = claim.status as ClaimStatus;
    if (result.statusAdvance) {
      const patch: Record<string, unknown> = { status: result.statusAdvance };
      if (result.statusAdvance === "closed") patch.closed_at = new Date().toISOString();
      // Milestone-driven advances can pass 'submitted' without the client
      // wizard ever submitting — stamp submitted_at so day-counters work.
      if (
        STATUS_ORDER[result.statusAdvance] >= STATUS_ORDER.submitted &&
        !claim.submitted_at
      ) {
        patch.submitted_at = new Date().toISOString();
      }
      const { error } = await svc.from("claims").update(patch).eq("id", claimId);
      if (!error) {
        events.push({
          claim_id: claimId,
          type: "status_advanced",
          payload_json: { from: claim.status, to: result.statusAdvance },
        });
        status = result.statusAdvance;
      }
    }

    if (events.length) await svc.from("claim_events").insert(events);
    return { status };
  } catch (err) {
    console.error("task engine failed:", err);
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tasks/runner.ts
git commit -m "feat: task-engine runner — fetch/apply wrapper around the pure engine"
```

---

### Task 6: Wire the engine into the four mutation routes

**Files:**
- Modify: `web/src/app/api/claims/[id]/classify/route.ts`
- Modify: `web/src/app/api/claims/[id]/checklist/route.ts` (lines 39–59: replace inline status logic)
- Modify: `web/src/app/api/claims/[id]/documents/route.ts` (after line 107)
- Modify: `web/src/app/api/claims/documents/route.ts` (after line 94)
- Modify: `web/src/app/api/claims/submit/route.ts` (after line 110)

**Interfaces:**
- Consumes: `runEngine` from `@/lib/tasks/runner` (Task 5).
- Produces: unchanged route response shapes (checklist route keeps `{ ok, status }`; others keep their current shape). The checklist route's status logic MOVES into the engine — behavior guaranteed by Task 4's tests.

- [ ] **Step 1: Classify route — delegate status to the engine**

In `web/src/app/api/claims/[id]/classify/route.ts`:

Add import at top:
```ts
import { runEngine } from "@/lib/tasks/runner";
```

Delete the `advanceStatus` computation (lines 41–44) and change the update block (lines 46–54) to update only `claim_type`:
```ts
  const svc = createServiceClient();
  const { error } = await svc
    .from("claims")
    .update({ claim_type: claimType })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
```

After the existing `claim_events` insert (`type: "classified"`), before the final return, add:
```ts
  // Reactive task engine: spawn track tasks + advance status (forward-only).
  const engine = await runEngine(id, { type: "track_confirmed" });

  return Response.json({
    ok: true,
    claim_type: claimType,
    status: engine?.status ?? claim.status,
  });
```
(Replace the existing final `return Response.json({ ok: true, claim_type: claimType });`.)

- [ ] **Step 2: Checklist route — replace inline status logic**

In `web/src/app/api/claims/[id]/checklist/route.ts`:

Add import:
```ts
import { runEngine } from "@/lib/tasks/runner";
```

Replace everything from the `// Milestones drive claim.status…` comment (line 38) through the final return (line 59) with:

```ts
  const svc = createServiceClient();
  const { error } = await svc
    .from("claims")
    .update({ checklist_state: updated })
    .eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Status transitions + task spawn/complete now live in the task engine
  // (forward-only; payment_received still closes the claim — engine rule).
  const engine = await runEngine(id, {
    type: "milestone_ticked",
    key: body.key,
    done: body.done,
  });

  return Response.json({ ok: true, status: engine?.status ?? claim.status });
```

- [ ] **Step 3: Agent documents route**

In `web/src/app/api/claims/[id]/documents/route.ts`, after the successful `claim_documents` insert (after the `dbErr` guard, before the final `return Response.json({ ok: true, id: doc.id, type, path });`), add:

```ts
  // Reactive task engine: auto-complete chase tasks this doc satisfies.
  await runEngine(id, { type: "doc_uploaded", docType: type });
```
Add import: `import { runEngine } from "@/lib/tasks/runner";`

- [ ] **Step 4: Client documents route**

In `web/src/app/api/claims/documents/route.ts`, after the `isLateUpload` claim_events block (line 94), before the final return, add:

```ts
  // Reactive task engine: auto-complete chase tasks this doc satisfies.
  await runEngine(claim.id, { type: "doc_uploaded", docType: type });
```
Add import: `import { runEngine } from "@/lib/tasks/runner";`
(This route already early-returns in demo mode before reaching Supabase — no extra guard needed.)

- [ ] **Step 5: Submit route**

In `web/src/app/api/claims/submit/route.ts`, after the final `claim_events` insert (`type: "submitted"`, line 106–110), before `return Response.json({ ok: true });`, add:

```ts
  // Reactive task engine: spawn the doc-chase task if base docs are missing.
  await runEngine(claim.id, { type: "claim_submitted" });
```
Add import: `import { runEngine } from "@/lib/tasks/runner";`

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all pass. (Build works without Supabase keys — the runner is only invoked at request time.)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/claims
git commit -m "feat: wire task engine into classify/checklist/documents/submit routes"
```

---

### Task 7: Task API routes — manual create + status patch

**Files:**
- Create: `web/src/app/api/claims/[id]/tasks/route.ts`
- Create: `web/src/app/api/claims/[id]/tasks/[taskId]/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `createServiceClient` from `@/lib/supabase/service` (same auth pattern as `notes/route.ts`).
- Produces:
  - `POST /api/claims/[id]/tasks` body `{ title: string, due_at?: string, note?: string }` → `{ task: { id, title, status, due_at, note, source, key } }`
  - `PATCH /api/claims/[id]/tasks/[taskId]` body `{ status?: "todo"|"in_progress"|"blocked"|"done", due_at?: string|null, note?: string|null }` → `{ task: … }` (same shape). The TasksPanel (Task 8) calls both.

- [ ] **Step 1: Manual-create route**

Create `web/src/app/api/claims/[id]/tasks/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/claims/[id]/tasks
// Body: { title: string, due_at?: string (ISO), note?: string }
// Agent adds an ad-hoc task to the claim's worklist (source='manual', key=null —
// manual tasks are never auto-completed by the engine).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return Response.json({ error: "title (non-empty string) required" }, { status: 400 });
  }
  if (title.length > 200) {
    return Response.json({ error: "title too long (max 200 chars)" }, { status: 400 });
  }
  let dueAt: string | null = null;
  if (payload.due_at != null) {
    const d = new Date(payload.due_at);
    if (isNaN(d.getTime())) {
      return Response.json({ error: "invalid due_at" }, { status: 400 });
    }
    dueAt = d.toISOString();
  }
  const note = typeof payload?.note === "string" ? payload.note.slice(0, 2000) : null;

  // RLS verification: auth-scoped select returns null if agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: task, error } = await svc
    .from("tasks")
    .insert({ claim_id: id, title, due_at: dueAt, note, source: "manual" })
    .select("id, key, title, status, due_at, note, source")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "task_created",
    payload_json: { task_id: task.id, by: user.email ?? null },
  });

  return Response.json({ task });
}
```

- [ ] **Step 2: Status-patch route**

Create `web/src/app/api/claims/[id]/tasks/[taskId]/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const VALID_STATUSES = new Set(["todo", "in_progress", "blocked", "done"]);

// PATCH /api/claims/[id]/tasks/[taskId]
// Body: { status?: TaskStatus, due_at?: string | null, note?: string | null }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload || (payload.status === undefined && payload.due_at === undefined && payload.note === undefined)) {
    return Response.json(
      { error: "at least one of status / due_at / note required" },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (payload.status !== undefined) {
    if (typeof payload.status !== "string" || !VALID_STATUSES.has(payload.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = payload.status;
    // completed_at tracks the done flag both ways (reopen clears it)
    patch.completed_at = payload.status === "done" ? new Date().toISOString() : null;
  }
  if (payload.due_at !== undefined) {
    if (payload.due_at === null) {
      patch.due_at = null;
    } else {
      const d = new Date(payload.due_at);
      if (isNaN(d.getTime())) {
        return Response.json({ error: "invalid due_at" }, { status: 400 });
      }
      patch.due_at = d.toISOString();
    }
  }
  if (payload.note !== undefined) {
    patch.note = payload.note === null ? null : String(payload.note).slice(0, 2000);
  }

  // RLS verification: auth-scoped select returns null if agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: task, error } = await svc
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("claim_id", id) // scope to this claim — taskId alone is not trusted
    .select("id, key, title, status, due_at, note, source")
    .single();
  if (error || !task) {
    return Response.json({ error: error?.message ?? "task not found" }, { status: 404 });
  }

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "task_updated",
    payload_json: { task_id: taskId, patch, by: user.email ?? null },
  });

  return Response.json({ task });
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/claims/[id]/tasks"
git commit -m "feat: task API — manual create + status/due/note patch"
```

---

### Task 8: TasksPanel + claim-detail integration

**Files:**
- Create: `web/src/app/dashboard/[id]/TasksPanel.tsx`
- Modify: `web/src/app/dashboard/[id]/page.tsx` (tasks fetch + panel + ReadinessStrip prop)
- Modify: `web/src/app/dashboard/[id]/ReadinessStrip.tsx` (optional `nextTask` prop)

**Interfaces:**
- Consumes: `POST /api/claims/[id]/tasks` and `PATCH /api/claims/[id]/tasks/[taskId]` (Task 7 shapes).
- Produces: `TaskView = { id: string; key: string | null; title: string; status: string; due_at: string | null; note: string | null; source: string }` (exported from `TasksPanel.tsx`); `ReadinessStrip` prop `nextTask?: { title: string; due_at: string | null; overdue: boolean } | null`.

- [ ] **Step 1: Create the TasksPanel client component**

Create `web/src/app/dashboard/[id]/TasksPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TaskView = {
  id: string;
  key: string | null;
  title: string;
  status: string;
  due_at: string | null;
  note: string | null;
  source: string;
};

function isOverdue(t: TaskView): boolean {
  return t.status !== "done" && !!t.due_at && new Date(t.due_at).getTime() < Date.now();
}

function dueLabel(due: string | null): string | null {
  if (!due) return null;
  return new Date(due).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

// The claim's action worklist — engine-spawned chases + the agent's own tasks.
// Docs never appear here (they live in the derived checklist); this panel is
// the dated, stateful layer on top.
export default function TasksPanel({
  claimId,
  tasks,
}: {
  claimId: string;
  tasks: TaskView[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);

  const open = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  const done = tasks.filter((t) => t.status === "done");

  async function patch(taskId: string, body: Record<string, unknown>) {
    setBusyId(taskId);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "עדכון נכשל");
      return;
    }
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, ...(due ? { due_at: due } : {}) }),
    });
    setAdding(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "הוספה נכשלה");
      return;
    }
    setTitle("");
    setDue("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      {open.length === 0 ? (
        <p className="text-sm text-zinc-400">אין משימות פתוחות.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => {
            const overdue = isOverdue(t);
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                  overdue ? "bg-red-50 ring-1 ring-inset ring-red-200" : "bg-zinc-50"
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${overdue ? "text-red-800" : "text-zinc-800"}`}>
                    {t.status === "blocked" && <span className="ml-1">⏸</span>}
                    {t.title}
                    {t.source === "manual" && (
                      <span className="mr-1 text-xs font-normal text-zinc-400">· ידני</span>
                    )}
                  </p>
                  {t.due_at && (
                    <p className={`text-xs ${overdue ? "text-red-600" : "text-zinc-400"}`}>
                      {overdue ? "באיחור — " : "עד "}
                      {dueLabel(t.due_at)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => patch(t.id, { status: t.status === "blocked" ? "todo" : "blocked" })}
                    disabled={busyId === t.id}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {t.status === "blocked" ? "שחרר" : "חסום"}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(t.id, { status: "done" })}
                    disabled={busyId === t.id}
                    className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    ✓ בוצע
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="הוסף משימה…"
          maxLength={200}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-2 text-sm text-zinc-600 outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? "מוסיף…" : "הוסף"}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-400">
            הושלמו ({done.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li key={t.id} className="text-sm text-zinc-400 line-through">
                {t.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fetch tasks in the detail page and render the panel**

In `web/src/app/dashboard/[id]/page.tsx`:

Add import (with the other panel imports, line ~19):
```tsx
import TasksPanel, { type TaskView } from "./TasksPanel";
```

Extend the `Promise.all` (line 108) with a fourth query — change the destructure to:
```tsx
  const [{ data: rows }, { data: formRows }, { data: noteRows }, { data: taskRows }] = await Promise.all([
```
and append inside the array, after the `claim_notes` query:
```tsx
    supabase
      .from("tasks")
      .select("id, key, title, status, due_at, note, source")
      .eq("claim_id", id)
      .order("due_at", { ascending: true }),
```
After `const notes: NoteView[] = noteRows ?? [];` add:
```tsx
  const tasks: TaskView[] = taskRows ?? [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const nextTask = openTasks.find((t) => t.due_at) ?? openTasks[0] ?? null;
```

In the JSX main column, insert a tasks section ABOVE the checklist section (before `<section>` with `רשימת מסמכים והתקדמות`, line ~388):
```tsx
            <section>
              <h2 className="mb-3 text-lg font-semibold text-zinc-900">
                משימות
                {openTasks.length > 0 && (
                  <span className="mr-1 text-sm font-normal text-zinc-400">
                    ({openTasks.length})
                  </span>
                )}
              </h2>
              <TasksPanel claimId={claim.id} tasks={tasks} />
            </section>
```

Pass the next task to the ReadinessStrip — extend its JSX props (line ~338):
```tsx
          nextTask={
            nextTask
              ? {
                  title: nextTask.title,
                  due_at: nextTask.due_at,
                  overdue:
                    !!nextTask.due_at &&
                    new Date(nextTask.due_at).getTime() < Date.now(),
                }
              : null
          }
```

- [ ] **Step 3: Show the next due task in the ReadinessStrip**

In `web/src/app/dashboard/[id]/ReadinessStrip.tsx`:

Add to the exported types (line ~7):
```tsx
export type NextTask = { title: string; due_at: string | null; overdue: boolean };
```

Add the prop to the signature and type (after `clientName`):
```tsx
  nextTask = null,
```
and in the props type:
```tsx
  nextTask?: NextTask | null;
```

In the **green** branch (the final return), under the `✓ אין מסמכים חוסמים` line, inside the same `<div className="min-w-0">`-less block — wrap the existing `<p>` in a `<div className="min-w-0">` and add below it:
```tsx
        {nextTask && (
          <p className={`mt-0.5 text-sm ${nextTask.overdue ? "font-medium text-red-700" : "text-green-700"}`}>
            {nextTask.overdue ? "⚠ משימה באיחור: " : "המשימה הבאה: "}
            {nextTask.title}
            {nextTask.due_at &&
              ` · עד ${new Date(nextTask.due_at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}`}
          </p>
        )}
```
So the green branch becomes:
```tsx
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-green-800">
          ✓ אין מסמכים חוסמים{nextMilestone ? ` — השלב הבא: ${nextMilestone.label}` : " — כל אבני הדרך הושלמו"}
        </p>
        {nextTask && (
          <p className={`mt-0.5 text-sm ${nextTask.overdue ? "font-medium text-red-700" : "text-green-700"}`}>
            {nextTask.overdue ? "⚠ משימה באיחור: " : "המשימה הבאה: "}
            {nextTask.title}
            {nextTask.due_at &&
              ` · עד ${new Date(nextTask.due_at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {nextMilestone && (
          <button
            type="button"
            onClick={() => advanceMilestone(nextMilestone.key)}
            disabled={busy}
            className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? "מעדכן…" : `סמן: ${nextMilestone.label}`}
          </button>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/[id]"
git commit -m "feat: TasksPanel on claim cockpit + next-task in readiness strip"
```

---

### Task 9: Dashboard worklist — next-task column

**Files:**
- Modify: `web/src/app/dashboard/page.tsx` (fetch open tasks)
- Modify: `web/src/app/dashboard/ClaimsTable.tsx` (column + due-date sort toggle)

**Interfaces:**
- Consumes: RLS-scoped `tasks` reads (agent sees only their claims' tasks via `claim_belongs_to_me`).
- Produces: `ClaimsTable` prop change — `Claim` gains `next_task: { title: string; due_at: string | null } | null`. This column is the proto-worklist B will later rank.

- [ ] **Step 1: Fetch each claim's earliest open task**

In `web/src/app/dashboard/page.tsx`, after the claims query (line 14–19), add:

```tsx
  // Earliest open task per claim (RLS-scoped). due_at-ascending with nulls
  // last, so row 1 per claim = the next dated action.
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("claim_id, title, due_at")
    .neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false });

  const nextTaskByClaim = new Map<string, { title: string; due_at: string | null }>();
  for (const t of taskRows ?? []) {
    if (!nextTaskByClaim.has(t.claim_id)) {
      nextTaskByClaim.set(t.claim_id, { title: t.title, due_at: t.due_at });
    }
  }
  const claimsWithTasks = (claims ?? []).map((c) => ({
    ...c,
    next_task: nextTaskByClaim.get(c.id) ?? null,
  }));
```

Change `<ClaimsTable claims={claims ?? []} />` to:
```tsx
        <ClaimsTable claims={claimsWithTasks} />
```

- [ ] **Step 2: Add the column + sort toggle to ClaimsTable**

In `web/src/app/dashboard/ClaimsTable.tsx`:

Extend the `Claim` interface (line 6):
```tsx
  next_task: { title: string; due_at: string | null } | null;
```

Replace the `ClaimsTable` component body with a sortable version:

```tsx
export default function ClaimsTable({ claims }: { claims: Claim[] }) {
  const [sortByDue, setSortByDue] = useState(false);

  if (claims.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        אין תביעות עדיין. צור תביעה חדשה ושלח את הקישור ללקוח.
      </p>
    );
  }

  const rows = sortByDue
    ? [...claims].sort((a, b) => {
        const ad = a.next_task?.due_at ? new Date(a.next_task.due_at).getTime() : Infinity;
        const bd = b.next_task?.due_at ? new Date(b.next_task.due_at).getTime() : Infinity;
        return ad - bd;
      })
    : claims;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-3 text-right font-medium">לקוח</th>
            <th className="px-4 py-3 text-right font-medium">סוג</th>
            <th className="px-4 py-3 text-right font-medium">סטטוס</th>
            <th className="px-4 py-3 text-right font-medium">
              <button
                type="button"
                onClick={() => setSortByDue((v) => !v)}
                className="font-medium hover:text-zinc-800"
                title="מיון לפי מועד יעד"
              >
                משימה הבאה {sortByDue ? "▲" : "↕"}
              </button>
            </th>
            <th className="px-4 py-3 text-right font-medium">תאריך</th>
            <th className="px-4 py-3 text-right font-medium">קישור</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((c) => {
            const overdue =
              !!c.next_task?.due_at &&
              new Date(c.next_task.due_at).getTime() < Date.now() &&
              c.status !== "closed";
            return (
              <tr key={c.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-900">
                  {c.urgent && <span className="ml-1 text-red-500">⚑</span>}
                  <Link href={`/dashboard/${c.id}`} className="hover:underline">
                    {c.client_name ?? (
                      <span className="text-zinc-400">ללא שם</span>
                    )}
                  </Link>
                  {c.client_phone && (
                    <div className="text-xs text-zinc-400">{c.client_phone}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {TYPE_LABEL[c.claim_type] ?? c.claim_type}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLOR[c.status] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.next_task ? (
                    <div className={overdue ? "text-red-700" : "text-zinc-600"}>
                      {overdue && <span className="ml-1">⚠</span>}
                      {c.next_task.title}
                      {c.next_task.due_at && (
                        <div className={`text-xs ${overdue ? "text-red-500" : "text-zinc-400"}`}>
                          עד{" "}
                          {new Date(c.next_task.due_at).toLocaleDateString("he-IL", {
                            day: "numeric",
                            month: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(c.submitted_at ?? c.created_at).toLocaleDateString("he-IL")}
                </td>
                <td className="px-4 py-3">
                  <CopyLinkButton token={c.access_token} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```
(`useState` is already imported at the top of the file; `CopyLinkButton`, label maps stay as-is.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/ClaimsTable.tsx
git commit -m "feat: dashboard next-task column with overdue flag + due-date sort"
```

---

### Task 10: Full verification + PR

**Files:** none new.

- [ ] **Step 1: Full check**

Run (in `web/`): `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all four pass. Fix anything that fails before proceeding.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/task-engine
gh pr create --title "feat: reactive task engine (phase-2 step A)" --body "..."
```
PR body: summarize per the spec (`docs/superpowers/specs/2026-07-08-task-engine-design.md`) — hybrid model, reactive spawn, no cron, routes wired, TasksPanel + dashboard worklist; note that migration 006 must run at Supabase provisioning time. End with the 🤖 Generated-with footer. **Do not merge** — leave for user review (doc-sync Action will comment).

---

## Self-Review Notes (resolved during planning)

- **`chase_missing_docs` blocking-vs-mandatory fix:** the spec's §3 table said "blocking docs missing" at submit, but at submit the track is always `unknown`, whose checklist items are all `blocking: false`. The rule therefore keys off **mandatory base docs** (`kind === "doc"`) and re-evaluates at `track_confirmed`. This implements the spec's intent.
- **Status semantics refined (spec §5):** task *spawns* do not advance status to `checklist_active` (else confirming a track would skip `classified`); only milestone ticks do. `payment_received → closed` preserves the current checklist-route behavior verbatim.
- **`tasks.track` is nullable** in inserts because `task_track` enum has no `unknown` value.
- **Same rule key on two tracks** (`chase_appraiser`) is legal — rules are filtered by track before keying; the templates test pins this.
