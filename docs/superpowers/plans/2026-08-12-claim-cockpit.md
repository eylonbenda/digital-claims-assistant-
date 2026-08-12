# Claim Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the claim detail page (`/dashboard/[id]`) into a cockpit: persistent header (identity + AI story + one primary next action) + 4 tabs (סקירה / עבודה על התיק / טופס ההודעה / קבצים).

**Architecture:** Pure presentation-layer change per spec `docs/superpowers/specs/2026-08-12-claim-cockpit-design.md`. Two new pure modules (`lib/cockpit/copy.ts`, `lib/cockpit/derive.ts`) compute the next action + tab badges; two new client components (`CockpitHeader`, `CockpitTabs`) render them; `page.tsx` slims to data-loading + composition. All existing panels are reused untouched; `ReadinessStrip.tsx` is absorbed and deleted. No engine/schema/API changes.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind, vitest.

## Global Constraints

- **Branch + PR, never commit to `main`**: all work on branch `feat/claim-cockpit`; PR at the end; do not self-merge.
- **English identifiers, Hebrew UI strings**; page is `dir="rtl"`.
- **Next.js is v16** — before writing/altering any Next-specific code (searchParams, navigation), read the relevant guide in `web/node_modules/next/dist/docs/`.
- All commands run from `C:\Users\eylon\digital-claims-assistant\web` unless stated. Tests: `npx vitest run <path>`.
- Commit messages end with: `Co-Authored-By: Claude <model> <noreply@anthropic.com>` (the executing model's name).
- No DB migrations are involved; if you think you need one, you've misread the spec — stop.
- **Spec deviation (approved rationale):** the spec's precedence ends at "form ready"; this plan appends two fallbacks — `milestone` (preserves ReadinessStrip's advance-milestone button, which would otherwise be lost) and `none` — so `deriveCockpit` is total.

---

### Task 0: Branch

- [ ] **Step 1:** From repo root: `git checkout main; git pull; git checkout -b feat/claim-cockpit`

---

### Task 1: Cockpit copy layer

**Files:**
- Modify: `web/src/lib/dashboard/copy.ts` (export the private `joinHe`)
- Create: `web/src/lib/cockpit/copy.ts`
- Test: `web/src/lib/cockpit/copy.test.ts`

**Interfaces:**
- Consumes: `joinHe(items: string[]): string` and `doActionLine(title: string, overdueDays: number): string` from `@/lib/dashboard/copy`.
- Produces (used by Task 2 and the components):
  - `CLASSIFY_LINE: string`
  - `chaseLine(labels: string[]): string`
  - `taskLine(title: string, overdueDays: number): string`
  - `formFieldsLine(n: number): string`
  - `formReadyLine(insurerLabel: string | null): string`
  - `FILL_FORM_LINE: string`
  - `milestoneLine(label: string): string`
  - `NO_ACTION_LINE: string`

- [ ] **Step 1:** In `web/src/lib/dashboard/copy.ts`, change `function joinHe` to `export function joinHe` (line ~35). No other change.

- [ ] **Step 2: Write the failing test** — `web/src/lib/cockpit/copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CLASSIFY_LINE, FILL_FORM_LINE, NO_ACTION_LINE,
  chaseLine, formFieldsLine, formReadyLine, milestoneLine, taskLine,
} from "./copy";

describe("cockpit copy", () => {
  it("chaseLine joins labels in Hebrew", () => {
    expect(chaseLine(["תמונות נזק", "רישיון נהיגה"])).toBe("מחכים לתמונות נזק ורישיון נהיגה מהלקוח/ה");
    expect(chaseLine(["רישיון רכב"])).toBe("מחכים לרישיון רכב מהלקוח/ה");
    expect(chaseLine([])).toBe("חסרים מסמכים חוסמים להגשה");
  });
  it("taskLine delegates to dashboard idiom", () => {
    expect(taskLine("בירור מול הראל", 0)).toBe("תורך: בירור מול הראל");
    expect(taskLine("בירור מול הראל", 2)).toBe("תורך: בירור מול הראל · באיחור 2 ימים");
  });
  it("formFieldsLine handles singular/plural", () => {
    expect(formFieldsLine(1)).toBe("נותר שדה חסר אחד בטופס");
    expect(formFieldsLine(3)).toBe("נותרו 3 שדות חסרים בטופס");
  });
  it("formReadyLine names the insurer when known", () => {
    expect(formReadyLine("הראל")).toBe("הטופס מוכן להורדה — הראל");
    expect(formReadyLine(null)).toBe("הטופס מוכן להורדה");
  });
  it("milestoneLine", () => {
    expect(milestoneLine("הוגש למבטח")).toBe("השלב הבא: הוגש למבטח");
  });
  it("constants are non-empty Hebrew", () => {
    for (const s of [CLASSIFY_LINE, FILL_FORM_LINE, NO_ACTION_LINE]) expect(s.length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 3:** Run `npx vitest run src/lib/cockpit/copy.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Implement** — `web/src/lib/cockpit/copy.ts`:

```ts
// The cockpit's language layer: system vocabulary in, agent Hebrew out.
// Mirrors lib/dashboard/copy.ts (spec §6) and reuses its idioms.
import { doActionLine, joinHe } from "@/lib/dashboard/copy";

export const CLASSIFY_LINE = "התיק מחכה לאישור מסלול";

export function chaseLine(labels: string[]): string {
  if (!labels.length) return "חסרים מסמכים חוסמים להגשה";
  return `מחכים ל${joinHe(labels)} מהלקוח/ה`;
}

export function taskLine(title: string, overdueDays: number): string {
  return doActionLine(title, overdueDays);
}

export function formFieldsLine(n: number): string {
  return n === 1 ? "נותר שדה חסר אחד בטופס" : `נותרו ${n} שדות חסרים בטופס`;
}

export function formReadyLine(insurerLabel: string | null): string {
  return insurerLabel ? `הטופס מוכן להורדה — ${insurerLabel}` : "הטופס מוכן להורדה";
}

export const FILL_FORM_LINE = "הנתונים מלאים — מלא את טופס ההודעה";

export function milestoneLine(label: string): string {
  return `השלב הבא: ${label}`;
}

export const NO_ACTION_LINE = "אין פעולות פתוחות — התיק במעקב";
```

- [ ] **Step 5:** Run `npx vitest run src/lib/cockpit/copy.test.ts` — expect PASS. Also `npx vitest run src/lib/dashboard` — dashboard tests still PASS (joinHe export is additive).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/cockpit web/src/lib/dashboard/copy.ts
git commit -m "feat: cockpit copy layer (reuses dashboard Hebrew idioms)"
```

---

### Task 2: `deriveCockpit` — next action + badges

**Files:**
- Create: `web/src/lib/cockpit/derive.ts`
- Test: `web/src/lib/cockpit/derive.test.ts`

**Interfaces:**
- Consumes: Task 1's copy functions; `ItemKind` from `@/lib/claims/checklist`.
- Produces (consumed by Task 4/5):

```ts
export type TabKey = "overview" | "work" | "form" | "files";
export type TaskLite = { title: string; status: string; due_at: string | null };
export type BlockingLite = { key: string; label: string; kind: ItemKind };
export type CockpitInput = {
  classificationNeedsAttention: boolean;
  blocking: BlockingLite[];        // blocking && !done checklist items
  chaseLabels: string[];           // labels of the client-suppliable subset (chaseableLabels(...))
  tasks: TaskLite[];               // all tasks for the claim
  missingFieldCount: number;       // analysis?.missing.length ?? 0 (0 when AI analysis is null)
  hasGeneratedForm: boolean;
  nextMilestone: { key: string; label: string } | null;
  insurerLabel: string | null;
  docsCount: number;
};
export type NextAction =
  | { kind: "classify"; line: string; targetTab: "overview" }
  | { kind: "chase"; line: string; targetTab: "work" }
  | { kind: "task"; line: string; targetTab: "work" }
  | { kind: "form_fields"; line: string; targetTab: "form" }
  | { kind: "form_fill"; line: string; targetTab: "form" }
  | { kind: "form_ready"; line: string; targetTab: "form" }
  | { kind: "milestone"; line: string; targetTab: "work"; milestoneKey: string; milestoneLabel: string }
  | { kind: "none"; line: string; targetTab: "overview" };
export type Badges = { overview: boolean; work: number; form: number; files: number };
export function deriveCockpit(input: CockpitInput, now: Date): { nextAction: NextAction; badges: Badges };
```

- [ ] **Step 1: Write the failing test** — `web/src/lib/cockpit/derive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveCockpit, type CockpitInput } from "./derive";

const NOW = new Date("2026-08-12T10:00:00+03:00");
const base: CockpitInput = {
  classificationNeedsAttention: false,
  blocking: [],
  chaseLabels: [],
  tasks: [],
  missingFieldCount: 0,
  hasGeneratedForm: false,
  nextMilestone: null,
  insurerLabel: "הראל",
  docsCount: 4,
};

describe("deriveCockpit precedence (spec §3, top-down first match)", () => {
  it("1. unconfirmed classification wins over everything", () => {
    const { nextAction } = deriveCockpit({
      ...base,
      classificationNeedsAttention: true,
      blocking: [{ key: "car_photo", label: "תמונות נזק", kind: "doc" }],
      tasks: [{ title: "x", status: "open", due_at: null }],
    }, NOW);
    expect(nextAction.kind).toBe("classify");
    expect(nextAction.targetTab).toBe("overview");
  });

  it("2. blocking docs → chase, with chaseable labels only in the line", () => {
    const { nextAction } = deriveCockpit({
      ...base,
      blocking: [
        { key: "car_photo", label: "תמונות נזק", kind: "doc" },
        { key: "accident_form", label: "טופס הודעה על תאונה", kind: "form" },
      ],
      chaseLabels: ["תמונות נזק"],
      tasks: [{ title: "x", status: "open", due_at: null }],
    }, NOW);
    expect(nextAction.kind).toBe("chase");
    expect(nextAction.line).toContain("תמונות נזק");
    expect(nextAction.targetTab).toBe("work");
  });

  it("3. tasks: most-overdue open task, done tasks ignored", () => {
    const { nextAction } = deriveCockpit({
      ...base,
      tasks: [
        { title: "ישנה וסגורה", status: "done", due_at: "2026-08-01T00:00:00Z" },
        { title: "באיחור", status: "open", due_at: "2026-08-10T00:00:00Z" },
        { title: "עתידית", status: "open", due_at: "2026-08-20T00:00:00Z" },
      ],
    }, NOW);
    expect(nextAction.kind).toBe("task");
    expect(nextAction.line).toBe("תורך: באיחור · באיחור 2 ימים");
  });

  it("4. missing form fields", () => {
    const { nextAction } = deriveCockpit({ ...base, missingFieldCount: 2 }, NOW);
    expect(nextAction.kind).toBe("form_fields");
    expect(nextAction.targetTab).toBe("form");
  });

  it("5. data complete but no form yet → form_fill", () => {
    const { nextAction } = deriveCockpit(base, NOW);
    expect(nextAction.kind).toBe("form_fill");
  });

  it("5b. form generated → form_ready", () => {
    const { nextAction } = deriveCockpit({ ...base, hasGeneratedForm: true }, NOW);
    expect(nextAction.kind).toBe("form_ready");
    expect(nextAction.line).toContain("הראל");
  });

  it("6. form done + milestone pending → milestone fallback", () => {
    const { nextAction } = deriveCockpit({
      ...base, hasGeneratedForm: true,
      nextMilestone: { key: "submitted_to_insurer", label: "הוגש למבטח" },
    }, NOW);
    expect(nextAction.kind).toBe("milestone");
    if (nextAction.kind === "milestone") expect(nextAction.milestoneKey).toBe("submitted_to_insurer");
  });
});

describe("badges", () => {
  it("work = open tasks + blocking doc items; form = missing fields; files = docs", () => {
    const { badges } = deriveCockpit({
      ...base,
      classificationNeedsAttention: true,
      blocking: [
        { key: "car_photo", label: "תמונות נזק", kind: "doc" },
        { key: "accident_form", label: "טופס", kind: "form" },
      ],
      tasks: [
        { title: "a", status: "open", due_at: null },
        { title: "b", status: "done", due_at: null },
      ],
      missingFieldCount: 2,
      docsCount: 7,
    }, NOW);
    expect(badges).toEqual({ overview: true, work: 2, form: 2, files: 7 });
  });
});
```

Note on rule-6 precedence vs rule 5b: `milestone` outranks `form_ready` when both apply (a generated form with a pending milestone means the download already happened or is trivial; the milestone is the real next step). Order inside the implementation: classify → chase → task → form_fields → (milestone if hasGeneratedForm && nextMilestone) → form_ready/form_fill → none.

- [ ] **Step 2:** Run `npx vitest run src/lib/cockpit/derive.test.ts` — expect FAIL.

- [ ] **Step 3: Implement** — `web/src/lib/cockpit/derive.ts`:

```ts
// Pure cockpit derivation: (already-loaded page data) → one next action + tab badges.
// No I/O, no clock reads — the caller passes `now` (spec §5).
import type { ItemKind } from "@/lib/claims/checklist";
import {
  CLASSIFY_LINE, FILL_FORM_LINE, NO_ACTION_LINE,
  chaseLine, formFieldsLine, formReadyLine, milestoneLine, taskLine,
} from "./copy";

export type TabKey = "overview" | "work" | "form" | "files";
export type TaskLite = { title: string; status: string; due_at: string | null };
export type BlockingLite = { key: string; label: string; kind: ItemKind };

export type CockpitInput = {
  classificationNeedsAttention: boolean;
  blocking: BlockingLite[];
  chaseLabels: string[];
  tasks: TaskLite[];
  missingFieldCount: number;
  hasGeneratedForm: boolean;
  nextMilestone: { key: string; label: string } | null;
  insurerLabel: string | null;
  docsCount: number;
};

export type NextAction =
  | { kind: "classify"; line: string; targetTab: "overview" }
  | { kind: "chase"; line: string; targetTab: "work" }
  | { kind: "task"; line: string; targetTab: "work" }
  | { kind: "form_fields"; line: string; targetTab: "form" }
  | { kind: "form_fill"; line: string; targetTab: "form" }
  | { kind: "form_ready"; line: string; targetTab: "form" }
  | { kind: "milestone"; line: string; targetTab: "work"; milestoneKey: string; milestoneLabel: string }
  | { kind: "none"; line: string; targetTab: "overview" };

export type Badges = { overview: boolean; work: number; form: number; files: number };

const DAY_MS = 86_400_000;

function nextOpenTask(tasks: TaskLite[], now: Date): { title: string; overdueDays: number } | null {
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) return null;
  const dated = open.filter((t) => t.due_at);
  const pick = dated.length
    ? dated.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0]
    : open[0];
  const overdueDays = pick.due_at
    ? Math.max(0, Math.floor((now.getTime() - new Date(pick.due_at).getTime()) / DAY_MS))
    : 0;
  return { title: pick.title, overdueDays };
}

export function deriveCockpit(input: CockpitInput, now: Date): { nextAction: NextAction; badges: Badges } {
  const badges: Badges = {
    overview: input.classificationNeedsAttention,
    work:
      input.tasks.filter((t) => t.status !== "done").length +
      input.blocking.filter((b) => b.kind === "doc").length,
    form: input.missingFieldCount,
    files: input.docsCount,
  };

  let nextAction: NextAction;
  const task = nextOpenTask(input.tasks, now);
  if (input.classificationNeedsAttention) {
    nextAction = { kind: "classify", line: CLASSIFY_LINE, targetTab: "overview" };
  } else if (input.blocking.length > 0) {
    nextAction = { kind: "chase", line: chaseLine(input.chaseLabels), targetTab: "work" };
  } else if (task) {
    nextAction = { kind: "task", line: taskLine(task.title, task.overdueDays), targetTab: "work" };
  } else if (input.missingFieldCount > 0) {
    nextAction = { kind: "form_fields", line: formFieldsLine(input.missingFieldCount), targetTab: "form" };
  } else if (input.hasGeneratedForm && input.nextMilestone) {
    nextAction = {
      kind: "milestone", line: milestoneLine(input.nextMilestone.label), targetTab: "work",
      milestoneKey: input.nextMilestone.key, milestoneLabel: input.nextMilestone.label,
    };
  } else if (input.hasGeneratedForm) {
    nextAction = { kind: "form_ready", line: formReadyLine(input.insurerLabel), targetTab: "form" };
  } else if (input.tasks.length || input.docsCount) {
    nextAction = { kind: "form_fill", line: FILL_FORM_LINE, targetTab: "form" };
  } else {
    nextAction = { kind: "none", line: NO_ACTION_LINE, targetTab: "overview" };
  }
  return { nextAction, badges };
}
```

Note: the base-case test (`deriveCockpit(base)`) has `docsCount: 4`, so it lands on `form_fill`, matching test 5. A truly empty claim (no tasks, no docs) yields `none`.

- [ ] **Step 4:** Run `npx vitest run src/lib/cockpit` — expect all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/cockpit
git commit -m "feat: deriveCockpit — next-action precedence + tab badges"
```

---

### Task 3: `CockpitHeader` client component

**Files:**
- Create: `web/src/app/dashboard/[id]/CockpitHeader.tsx`

**Interfaces:**
- Consumes: `NextAction` from `@/lib/cockpit/derive`; `chaseMessage`, `waHref` from `@/lib/wa` (same as ReadinessStrip today).
- Produces (consumed by Task 4):

```ts
export type CockpitHeaderProps = {
  claimId: string;
  clientName: string | null;
  clientPhone: string | null;
  urgent: boolean;
  statusLabel: string;
  statusBadgeClass: string;   // the STATUS_BADGE tailwind string
  daysOpen: number;
  daysSinceActivity: number | null;
  summary: string | null;     // analysis?.summary ?? null
  nextAction: NextAction;
  chaseLabels: string[];      // for building the WhatsApp body client-side
  uploadUrl: string;          // absolute /c/<token>, built server-side
  onNavigate: (tab: TabKey) => void;  // provided by CockpitTabs, NOT serialized from the server
};
export default function CockpitHeader(props: CockpitHeaderProps): JSX.Element;
```

No unit test (repo convention: client panels are untested; behavior verified in Task 6). Reference `ReadinessStrip.tsx` before deleting it — the chase and milestone behaviors move here verbatim.

- [ ] **Step 1: Implement** `web/src/app/dashboard/[id]/CockpitHeader.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chaseMessage, waHref } from "@/lib/wa";
import type { NextAction, TabKey } from "@/lib/cockpit/derive";

export type CockpitHeaderProps = {
  claimId: string;
  clientName: string | null;
  clientPhone: string | null;
  urgent: boolean;
  statusLabel: string;
  statusBadgeClass: string;
  daysOpen: number;
  daysSinceActivity: number | null;
  summary: string | null;
  nextAction: NextAction;
  chaseLabels: string[];
  uploadUrl: string;
  onNavigate: (tab: TabKey) => void;
};

// The cockpit's fixed instrument panel: identity, story, one primary action.
// Chase + milestone semantics are moved verbatim from the old ReadinessStrip
// (same WhatsApp flow, same outbound-events instrumentation, same PATCH).
export default function CockpitHeader(p: CockpitHeaderProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chaseBody = chaseMessage({
    firstName: p.clientName?.split(" ")[0] ?? null,
    items: p.chaseLabels,
    uploadUrl: p.uploadUrl,
  });
  const chaseHref = waHref(p.clientPhone, chaseBody);

  function logChase() {
    fetch("/api/outbound/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: p.claimId, task_key: "chase_missing_docs", kind: "sent", body: chaseBody }),
    }).catch(() => {});
  }

  async function advanceMilestone(key: string) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/claims/${p.claimId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, done: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError((json as { error?: string }).error ?? "עדכון נכשל");
      return;
    }
    router.refresh();
  }

  const na = p.nextAction;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900">{p.clientName ?? "ללא שם"}</h1>
            {p.urgent && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                ⚑ דחוף
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${p.statusBadgeClass}`}>
              {p.statusLabel}
            </span>
          </div>
          {p.clientPhone && <p className="mt-1 text-sm text-zinc-500" dir="ltr">{p.clientPhone}</p>}
        </div>
        <div className="shrink-0 text-sm text-zinc-400">
          {p.daysOpen === 0 ? "נפתחה היום" : `${p.daysOpen} ימים פתוחה`}
          {p.daysSinceActivity !== null && (
            <span className={p.daysSinceActivity >= 4 ? "text-amber-700" : ""}>
              {" · עדכון "}
              {p.daysSinceActivity === 0 ? "היום" : `לפני ${p.daysSinceActivity} ימים`}
            </span>
          )}
        </div>
      </div>

      {p.summary && (
        <p className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700">
          🤖 {p.summary}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-semibold text-blue-900">
          הפעולה הבאה: <span className="font-normal">{na.line}</span>
        </p>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {na.kind === "chase" && chaseHref ? (
            <a
              href={chaseHref} onClick={logChase} target="_blank" rel="noopener noreferrer"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              💬 בקש מהלקוח בוואטסאפ ↗
            </a>
          ) : na.kind === "milestone" ? (
            <button
              type="button" disabled={busy} onClick={() => advanceMilestone(na.milestoneKey)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? "מעדכן…" : `סמן: ${na.milestoneLabel}`}
            </button>
          ) : na.kind !== "none" ? (
            <button
              type="button" onClick={() => p.onNavigate(na.targetTab)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              פתח ←
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2:** `npx eslint src/app/dashboard/[id]/CockpitHeader.tsx` and `npx tsc --noEmit` (build check comes with the page swap in Task 5) — expect clean.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/dashboard/[id]/CockpitHeader.tsx"
git commit -m "feat: CockpitHeader — identity + story + primary next action"
```

---

### Task 4: `CockpitTabs` client component

**Files:**
- Create: `web/src/app/dashboard/[id]/CockpitTabs.tsx`

**Interfaces:**
- Consumes: `Badges`, `NextAction`, `TabKey` from `@/lib/cockpit/derive`; `CockpitHeader` + `CockpitHeaderProps` from Task 3.
- Produces (consumed by Task 5):

```ts
export type CockpitTabsProps = {
  header: Omit<CockpitHeaderProps, "onNavigate">;  // fully serializable — RSC-safe
  badges: Badges;
  initialTab: TabKey;                               // parsed server-side from ?tab=
  overview: React.ReactNode;                        // server-rendered panes
  work: React.ReactNode;
  form: React.ReactNode;
  files: React.ReactNode;
};
export default function CockpitTabs(props: CockpitTabsProps): JSX.Element;
```

Design constraints (from spec §4–5): panes are server-rendered once and toggled with CSS (`hidden`), never unmounted — no refetch on switch. `?tab=` is synced with `history.replaceState` (no navigation). `CockpitHeader` is rendered *inside* this component so it can receive the non-serializable `onNavigate` callback. Before writing, skim `web/node_modules/next/dist/docs/` on client components + `useSearchParams` to confirm v16 idioms.

- [ ] **Step 1: Implement** `web/src/app/dashboard/[id]/CockpitTabs.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import type { Badges, TabKey } from "@/lib/cockpit/derive";
import CockpitHeader, { type CockpitHeaderProps } from "./CockpitHeader";

export type CockpitTabsProps = {
  header: Omit<CockpitHeaderProps, "onNavigate">;
  badges: Badges;
  initialTab: TabKey;
  overview: ReactNode;
  work: ReactNode;
  form: ReactNode;
  files: ReactNode;
};

const TAB_LABEL: Record<TabKey, string> = {
  overview: "סקירה",
  work: "עבודה על התיק",
  form: "טופס ההודעה",
  files: "קבצים",
};
const TAB_ORDER: TabKey[] = ["overview", "work", "form", "files"];

// Panes stay mounted (server-rendered once); switching is show/hide, and the
// URL mirrors the active tab via replaceState so links/refreshes land right.
export default function CockpitTabs(p: CockpitTabsProps) {
  const [tab, setTab] = useState<TabKey>(p.initialTab);

  function navigate(next: TabKey) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
    document.getElementById("cockpit-panes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function badgeFor(key: TabKey): ReactNode {
    if (key === "overview")
      return p.badges.overview ? <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" /> : null;
    const n = key === "work" ? p.badges.work : key === "form" ? p.badges.form : p.badges.files;
    if (!n) return null;
    const cls = key === "files" ? "bg-zinc-400" : "bg-red-500";
    return (
      <span className={`mr-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-white ${cls}`}>{n}</span>
    );
  }

  const panes: Record<TabKey, ReactNode> = {
    overview: p.overview, work: p.work, form: p.form, files: p.files,
  };

  return (
    <div className="space-y-6">
      <CockpitHeader {...p.header} onNavigate={navigate} />
      <div className="border-b border-zinc-200" role="tablist">
        {TAB_ORDER.map((key) => (
          <button
            key={key} type="button" role="tab" aria-selected={tab === key}
            onClick={() => navigate(key)}
            className={`px-4 py-2.5 text-sm ${
              tab === key
                ? "-mb-px border-b-2 border-blue-600 font-semibold text-blue-700"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {TAB_LABEL[key]}
            {badgeFor(key)}
          </button>
        ))}
      </div>
      <div id="cockpit-panes">
        {TAB_ORDER.map((key) => (
          <div key={key} role="tabpanel" className={tab === key ? "space-y-6" : "hidden"}>
            {panes[key]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `npx eslint "src/app/dashboard/[id]/CockpitTabs.tsx"` — expect clean.

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/dashboard/[id]/CockpitTabs.tsx"
git commit -m "feat: CockpitTabs — badge tab bar, mounted panes, ?tab= sync"
```

---

### Task 5: Recompose `page.tsx`, delete `ReadinessStrip`

**Files:**
- Modify: `web/src/app/dashboard/[id]/page.tsx`
- Delete: `web/src/app/dashboard/[id]/ReadinessStrip.tsx`

**Interfaces:**
- Consumes: everything above. All data loading, RLS queries, checklist/classification/analysis computation, and signed-URL minting in `page.tsx` **stay byte-identical** — only the derivations feeding the removed hero/strip and the JSX below them change.

Pane composition (spec §4), using the components already imported by the page:

| Pane | JSX (existing components, unchanged props) |
|---|---|
| `overview` | snapshot `<dl>` (track+✓, insurer, readiness "X מתוך Y" from checklist done/total + missing labels, last activity) · `ClaimTypeConfirm` wrapped in the existing `<details open={classificationNeedsAttention}>` pattern · `NotesPanel` |
| `work` | `TasksPanel` · `ChecklistPanel` · `AgentDocUpload` (same headings as today) |
| `form` | generated-forms `<ul>` (moved as-is) · `FormFieldEditor` **without** the `<details>` wrapper (open by default, keep the explanatory `<p>`) · `FormGenerator` |
| `files` | `ClaimDocuments` |

- [ ] **Step 1:** In `page.tsx`, add a `searchParams` prop (v16 idiom — confirm in `node_modules/next/dist/docs/`, it is a Promise like `params`): `searchParams: Promise<{ tab?: string }>`. Parse `const tabParam = (await searchParams).tab; const initialTab: TabKey = tabParam === "work" || tabParam === "form" || tabParam === "files" ? tabParam : "overview";`

- [ ] **Step 2:** After the existing derivations, build the cockpit inputs (replacing the `ReadinessStrip` prop assembly):

```tsx
const { nextAction, badges } = deriveCockpit(
  {
    classificationNeedsAttention,
    blocking: blockingMissing.map(({ key, label, kind }) => ({ key, label, kind })),
    chaseLabels: chaseableLabels(blockingMissing),
    tasks: tasks.map(({ title, status, due_at }) => ({ title, status, due_at })),
    missingFieldCount: analysis?.missing.length ?? 0,
    hasGeneratedForm: forms.length > 0,
    nextMilestone: nextMilestone ? { key: nextMilestone.key, label: nextMilestone.label } : null,
    insurerLabel: claim.policy_insurer ? INSURER_LABEL[claim.policy_insurer] ?? claim.policy_insurer : null,
    docsCount: docs.length,
  },
  new Date(now),
);
```

(`chaseableLabels` is imported from `@/lib/claims/checklist` — it currently feeds ReadinessStrip; `now` already exists in the page. `nextTask`/`daysOpen`/`daysSinceActivity` stay.)

- [ ] **Step 3:** Replace the JSX from the hero `<section>` through the closing of the documents section with:

```tsx
<main className="mx-auto max-w-6xl p-6">
  <CockpitTabs
    header={{
      claimId: claim.id,
      clientName: claim.client_name,
      clientPhone: claim.client_phone,
      urgent: !!claim.urgent,
      statusLabel: STATUS_LABEL[claim.status] ?? claim.status,
      statusBadgeClass: statusBadge,
      daysOpen,
      daysSinceActivity,
      summary: analysis?.summary ?? null,
      nextAction,
      chaseLabels: chaseableLabels(blockingMissing),
      uploadUrl: `${origin}/c/${claim.access_token}`,
    }}
    badges={badges}
    initialTab={initialTab}
    overview={/* snapshot dl + ClaimTypeConfirm details + NotesPanel, per the pane table */}
    work={/* TasksPanel + ChecklistPanel + AgentDocUpload sections */}
    form={/* forms ul + FormFieldEditor (no details) + FormGenerator */}
    files={<ClaimDocuments docs={docs} />}
  />
</main>
```

The pane JSX is lifted from the current file with headings intact — cut/paste the existing sections into the four props; only the `<details>` around `FormFieldEditor` and the aside/grid wrappers are dropped. The overview snapshot `<dl>` reuses the current hero `<dl>` rows plus a readiness row: `{done}/{total} פריטים` from `checklistItems.filter(i => i.done).length` / `checklistItems.length`, and `חסרים: {blockingMissing.map(b => b.label).join(", ")}` when non-empty.

- [ ] **Step 4:** Remove the `ReadinessStrip` import and `git rm web/src/app/dashboard/[id]/ReadinessStrip.tsx`. Add imports: `CockpitTabs`, `deriveCockpit`, `chaseableLabels`, `type TabKey`.

- [ ] **Step 5:** `npm run lint; npx tsc --noEmit; npm run build` — expect clean. `npx vitest run` — all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add -A web/src/app/dashboard/[id]
git commit -m "feat: claim cockpit — tabbed recomposition of the claim detail page"
```

---

### Task 6: Manual verification in the dev server

- [ ] **Step 1:** Start the dev server (preview tooling, launch config `web`) and open a real claim from the dashboard.
- [ ] **Step 2:** Verify, fixing anything broken before proceeding:
  - Header shows name/phone/status/urgency, story line, and exactly one next-action row; RTL renders correctly.
  - Precedence sanity: a claim with blocking docs shows the chase action; its WhatsApp link opens with the same message body as before the change.
  - Tab switching: no network requests on switch (check the network panel), state in panels survives switching away/back (e.g. a half-typed note).
  - Badges match reality (open tasks + blocking docs / missing fields / doc count).
  - `?tab=form` deep-link lands on the form tab; switching tabs updates the URL without navigation; refresh preserves the tab.
  - Null-analysis claim (or temporarily simulate) still renders — no story line, next action still computed.
- [ ] **Step 3:** Commit any fixes (`fix: …` messages, same trailer rule).

---

### Task 7: PR

- [ ] **Step 1:** `git push -u origin feat/claim-cockpit`
- [ ] **Step 2:** `gh pr create` (use `--body-file` — PowerShell mangles Hebrew/quotes in inline bodies) with a body covering: cockpit header + 4 tabs, spec link, the milestone-fallback deviation note, "no schema changes", and the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` footer. Leave the PR for the user to review/merge.
