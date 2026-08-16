# Collection Wizard Lightness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the client collection wizard (`/c/[token]`) feel lighter without removing questions: 3 named chapters, tap-first ordering with auto-advance, milestone screens, larger mobile type — plus the overdue split of the 1,000-line `CollectionWizard.tsx`.

**Architecture:** Per spec `docs/superpowers/specs/2026-08-13-collection-lightness-design.md`. A new pure step registry (`steps.ts`) defines order/chapters/relevance/completeness once; per-step JSX moves verbatim into `components/collection/steps/`; a `WizardShell` renders chips/dots/milestones/nav; `persist.ts` migrates from numeric step index (v1) to step key (v2). State shape, submit API, uploads, plate lookup, geolocation: untouched.

**Tech Stack:** Next.js 16 (client components), TypeScript, Tailwind, vitest.

## Global Constraints

- **Branch + PR, never commit to `main`**: all work on branch `feat/collection-lightness` cut from `origin/main`; PR at the end; do not self-merge.
- English identifiers, Hebrew UI strings; the flow is `dir="rtl"` (inherited from the root layout).
- **This Next.js is v16** — before using any Next-specific API, read the relevant guide in `web/node_modules/next/dist/docs/`. (The wizard is a plain client component; no Next APIs are expected to change.)
- All commands run from `web/`. Tests: `npx vitest run <path>`.
- Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`; write messages to a temp file and use `git commit -F <file>` (Hebrew-safe on this Windows shell).
- No DB migrations, no API changes, no `State` shape change. If you think you need one, re-read the spec — stop.
- New/moved UI copy is verbatim-preserved unless a task explicitly changes it (the type-size bump changes classes, not words).

### The new step order (single source of truth, used by every task)

| # | key | chapter | tap? | relevant when | complete when (ported from old `canNext`) |
|---|-----|---------|------|----------------|--------------------------------------------|
| 0 | `intro` | intro | no | always | `consent` |
| 1 | `injuries` | quick | yes | always | `injuries !== null` |
| 2 | `driver_who` | quick | yes | always | `driver.isInsured !== null` |
| 3 | `fault` | quick | yes | always | `fault !== null` |
| 4 | `tp_present` | quick | yes | always | `thirdParty.present !== null` |
| 5 | `vehicle` | details | no | always | plate + manufacturer + year filled |
| 6 | `insured` | details | no | always | first/last/id/mobile/city + policyInsurer + insuranceType filled |
| 7 | `driver_details` | details | no | `driver.isInsured === false` | driver first/last/id filled |
| 8 | `tp_details` | details | no | `thirdParty.present === true` | tp name + plate + insurer filled |
| 9 | `when_where` | details | no | always | date + time + location filled |
| 10 | `description` | details | no | always | description filled |
| 11 | `documents` | finish | no | always | always (optional) |
| 12 | `summary` | finish | no | always | always (submit gate = declaration checkbox, unchanged) |

Note the split: old step 3 (מי נהג) becomes `driver_who` (choice only) + `driver_details`; old step 8 (צד שני) becomes `tp_present` (choice only) + `tp_details`. Old numeric steps are otherwise the same screens.

---

### Task 0: Branch

- [ ] **Step 1:** From a clean checkout of `origin/main`: `git fetch origin` then create branch `feat/collection-lightness` (in a worktree if the session uses one).

---

### Task 1: Step registry (`steps.ts`)

**Files:**
- Create: `web/src/components/collection/steps.ts`
- Test: `web/src/components/collection/steps.test.ts`

**Interfaces:**
- Consumes: `State` from `@/lib/collection/claim-state`.
- Produces (used by Tasks 2, 4, 5):

```ts
export type StepKey =
  | "intro" | "injuries" | "driver_who" | "fault" | "tp_present"
  | "vehicle" | "insured" | "driver_details" | "tp_details"
  | "when_where" | "description" | "documents" | "summary";
export type Chapter = "intro" | "quick" | "details" | "finish";
export type StepDef = {
  key: StepKey;
  chapter: Chapter;
  isTapStep: boolean;
  isRelevant: (s: State) => boolean;
  isComplete: (s: State) => boolean;
};
export const STEPS: StepDef[];                          // the order above
export function visibleSteps(s: State): StepDef[];       // STEPS.filter(isRelevant)
export function firstIncompleteKey(s: State): StepKey;   // first visible step with !isComplete; falls back to "summary"
export function isStepKey(v: unknown): v is StepKey;
export const CHIP_LABEL: Record<Exclude<Chapter, "intro">, string>; // quick: "שאלות מהירות", details: "הפרטים", finish: "סיום"
export const TIME_LEFT: Record<Chapter, string>;         // intro+quick: "עוד כ־3 דקות", details: "עוד כ־2 דקות", finish: "עוד כדקה"
```

- [ ] **Step 1: Write the failing test** — `web/src/components/collection/steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STEPS, firstIncompleteKey, isStepKey, visibleSteps } from "./steps";
import type { State } from "@/lib/collection/claim-state";

const BASE: State = {
  consent: false,
  injuries: null,
  policyInsurer: "",
  insuranceType: "",
  insured: { first_name: "", last_name: "", id_number: "", mobile: "", city: "" },
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "", manufacturer: "", year: "" },
  accident: { date: "", time: "", location: "", description: "" },
  fault: null,
  thirdParty: { present: null, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
  documents: [],
};

describe("step registry", () => {
  it("orders tap chapter before typing chapter", () => {
    const keys = STEPS.map((s) => s.key);
    expect(keys).toEqual([
      "intro", "injuries", "driver_who", "fault", "tp_present",
      "vehicle", "insured", "driver_details", "tp_details",
      "when_where", "description", "documents", "summary",
    ]);
  });

  it("skips driver_details when the insured drove, keeps it otherwise", () => {
    const insuredDrove: State = { ...BASE, driver: { ...BASE.driver, isInsured: true } };
    expect(visibleSteps(insuredDrove).map((s) => s.key)).not.toContain("driver_details");
    const otherDrove: State = { ...BASE, driver: { ...BASE.driver, isInsured: false } };
    expect(visibleSteps(otherDrove).map((s) => s.key)).toContain("driver_details");
  });

  it("skips tp_details when no third party", () => {
    const noTp: State = { ...BASE, thirdParty: { ...BASE.thirdParty, present: false } };
    expect(visibleSteps(noTp).map((s) => s.key)).not.toContain("tp_details");
  });

  it("firstIncompleteKey walks the visible order", () => {
    expect(firstIncompleteKey(BASE)).toBe("intro");
    const consented: State = { ...BASE, consent: true };
    expect(firstIncompleteKey(consented)).toBe("injuries");
    const quickDone: State = {
      ...consented,
      injuries: false,
      fault: "third_party",
      driver: { ...BASE.driver, isInsured: true },
      thirdParty: { ...BASE.thirdParty, present: false },
    };
    expect(firstIncompleteKey(quickDone)).toBe("vehicle");
  });

  it("falls back to summary when everything is complete", () => {
    const full: State = {
      ...BASE,
      consent: true,
      injuries: false,
      fault: "me",
      policyInsurer: "harel",
      insuranceType: "comprehensive",
      insured: { first_name: "א", last_name: "ב", id_number: "1", mobile: "05", city: "ת״א" },
      driver: { ...BASE.driver, isInsured: true },
      vehicle: { plate: "1234567", manufacturer: "טויוטה", year: "2020" },
      accident: { date: "2026-08-01", time: "10:00", location: "איילון", description: "פגיעה מאחור" },
      thirdParty: { ...BASE.thirdParty, present: false },
    };
    expect(firstIncompleteKey(full)).toBe("summary");
  });

  it("isStepKey guards strings", () => {
    expect(isStepKey("vehicle")).toBe(true);
    expect(isStepKey("no_such")).toBe(false);
    expect(isStepKey(4)).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/components/collection/steps.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement** — `web/src/components/collection/steps.ts`:

```ts
// The wizard's single source of truth for step order, chapters, relevance and
// completeness (spec §3, §6). Pure — no React, no I/O.
import type { State } from "@/lib/collection/claim-state";

export type StepKey =
  | "intro" | "injuries" | "driver_who" | "fault" | "tp_present"
  | "vehicle" | "insured" | "driver_details" | "tp_details"
  | "when_where" | "description" | "documents" | "summary";

export type Chapter = "intro" | "quick" | "details" | "finish";

export type StepDef = {
  key: StepKey;
  chapter: Chapter;
  isTapStep: boolean;
  isRelevant: (s: State) => boolean;
  isComplete: (s: State) => boolean;
};

const filled = (v: string) => v.trim().length > 0;
const always = () => true;

export const STEPS: StepDef[] = [
  { key: "intro",          chapter: "intro",   isTapStep: false, isRelevant: always, isComplete: (s) => s.consent },
  { key: "injuries",       chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.injuries !== null },
  { key: "driver_who",     chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.driver.isInsured !== null },
  { key: "fault",          chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.fault !== null },
  { key: "tp_present",     chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.thirdParty.present !== null },
  { key: "vehicle",        chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) => filled(s.vehicle.plate) && filled(s.vehicle.manufacturer) && filled(s.vehicle.year) },
  { key: "insured",        chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) =>
      filled(s.insured.first_name) && filled(s.insured.last_name) && filled(s.insured.id_number) &&
      filled(s.insured.mobile) && filled(s.insured.city) && filled(s.policyInsurer) && filled(s.insuranceType) },
  { key: "driver_details", chapter: "details", isTapStep: false,
    isRelevant: (s) => s.driver.isInsured === false,
    isComplete: (s) => filled(s.driver.first_name) && filled(s.driver.last_name) && filled(s.driver.id_number) },
  { key: "tp_details",     chapter: "details", isTapStep: false,
    isRelevant: (s) => s.thirdParty.present === true,
    isComplete: (s) => filled(s.thirdParty.name) && filled(s.thirdParty.plate) && filled(s.thirdParty.insurer) },
  { key: "when_where",     chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) => filled(s.accident.date) && filled(s.accident.time) && filled(s.accident.location) },
  { key: "description",    chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) => filled(s.accident.description) },
  { key: "documents",      chapter: "finish",  isTapStep: false, isRelevant: always, isComplete: always },
  { key: "summary",        chapter: "finish",  isTapStep: false, isRelevant: always, isComplete: always },
];

export function visibleSteps(s: State): StepDef[] {
  return STEPS.filter((step) => step.isRelevant(s));
}

// Resume position: the first visible step the claimant hasn't completed.
// `documents`/`summary` are always "complete", so a fully-filled state lands on
// documents — firstIncompleteKey therefore skips always-complete steps and
// falls back to "summary" only past the end.
export function firstIncompleteKey(s: State): StepKey {
  for (const step of visibleSteps(s)) {
    if (step.key === "documents" || step.key === "summary") continue;
    if (!step.isComplete(s)) return step.key;
  }
  return "summary";
}

export function isStepKey(v: unknown): v is StepKey {
  return typeof v === "string" && STEPS.some((s) => s.key === v);
}

export const CHIP_LABEL: Record<Exclude<Chapter, "intro">, string> = {
  quick: "שאלות מהירות",
  details: "הפרטים",
  finish: "סיום",
};

export const TIME_LEFT: Record<Chapter, string> = {
  intro: "עוד כ־3 דקות",
  quick: "עוד כ־3 דקות",
  details: "עוד כ־2 דקות",
  finish: "עוד כדקה",
};
```

Wait — the fallback test expects `firstIncompleteKey(full) === "summary"`, and the loop above skips `documents`. That is intentional: a resumed fully-filled session should land on the summary (review + submit), not the optional documents screen.

- [ ] **Step 4:** Run `npx vitest run src/components/collection/steps.test.ts` — expect all PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/collection/steps.ts web/src/components/collection/steps.test.ts
git commit -F <msgfile>   # "feat: collection step registry — chapters, relevance, resume position"
```

---

### Task 2: Persistence v2 — step key + migration

**Files:**
- Modify: `web/src/lib/collection/persist.ts`
- Modify: `web/src/lib/collection/persist.test.ts` (update to the new signature; keep existing sanitize/merge cases)

**Interfaces:**
- Consumes: `isStepKey`, `type StepKey` from `@/components/collection/steps` (type-only + guard; persist stays otherwise UI-agnostic).
- Produces (used by Task 4):

```ts
export const storageKey = (token: string) => `claim-wizard:v2:${token}`;
export const legacyStorageKey = (token: string) => `claim-wizard:v1:${token}`;
export function saveWizardState(token: string, stepKey: StepKey, state: State): void;
// stepKey === null → caller resumes at firstIncompleteKey(state) (legacy blob or unknown key)
export function loadWizardState(token: string, base: State): { stepKey: StepKey | null; state: State } | null;
export function clearWizardState(token: string): void;  // removes BOTH v2 and v1 keys
```

- [ ] **Step 1: Write the failing tests** — add to `web/src/lib/collection/persist.test.ts` (adapt existing tests to the new signature in the same edit; the merge-over-base and sanitizeDocs behaviors are unchanged and their cases stay):

```ts
// New cases (exact code; adjust imports to the file's existing style):
it("round-trips a v2 save with a step key", () => {
  saveWizardState("tok", "vehicle", state);
  const loaded = loadWizardState("tok", base);
  expect(loaded?.stepKey).toBe("vehicle");
});

it("migrates a v1 numeric-step blob: state restored, stepKey null, v1 key removed", () => {
  localStorage.setItem(`claim-wizard:v1:tok`, JSON.stringify({ step: 4, state }));
  const loaded = loadWizardState("tok", base);
  expect(loaded).not.toBeNull();
  expect(loaded!.stepKey).toBeNull();
  expect(loaded!.state.insured.first_name).toBe(state.insured.first_name);
  expect(localStorage.getItem(`claim-wizard:v1:tok`)).toBeNull();
});

it("returns stepKey null for an unknown saved key", () => {
  localStorage.setItem(`claim-wizard:v2:tok`, JSON.stringify({ stepKey: "no_such_step", state }));
  expect(loadWizardState("tok", base)?.stepKey).toBeNull();
});

it("clearWizardState removes both versions", () => {
  localStorage.setItem(`claim-wizard:v1:tok`, "x");
  saveWizardState("tok", "intro", state);
  clearWizardState("tok");
  expect(localStorage.getItem(`claim-wizard:v1:tok`)).toBeNull();
  expect(localStorage.getItem(`claim-wizard:v2:tok`)).toBeNull();
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/collection/persist.test.ts` — expect FAIL.

- [ ] **Step 3: Implement.** In `persist.ts`: bump `VERSION` to 2 and add `legacyStorageKey` (hardcoded `v1`). `saveWizardState(token, stepKey, state)` writes `{ stepKey, state }`. `loadWizardState`: try v2 key first — parse, validate `state` as today, `stepKey: isStepKey(saved.stepKey) ? saved.stepKey : null`. If no v2 blob, try v1 key: parse `{ step, state }` as the old code did, return `{ stepKey: null, state: <merged> }`, and remove the v1 key (best-effort, in a try/catch). The state-merging block (insured/driver/vehicle/accident/thirdParty/declaration spreads + `sanitizeDocs`) is shared by both paths — extract it into a local `mergeState(base, saved)` helper rather than duplicating. `clearWizardState` removes both keys.

- [ ] **Step 4:** Run `npx vitest run src/lib/collection` — all PASS (including the pre-existing cases you adapted).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/collection/persist.ts web/src/lib/collection/persist.test.ts
git commit -F <msgfile>   # "feat: wizard persistence v2 — step key + v1 migration"
```

---

### Task 3: `WizardShell` — chips, dots, time-left, milestone, nav, type bump

**Files:**
- Create: `web/src/components/collection/WizardShell.tsx`

**Interfaces:**
- Consumes: `Chapter`, `CHIP_LABEL`, `TIME_LEFT` from `./steps`.
- Produces (used by Task 4):

```tsx
export type ShellProps = {
  chapter: Chapter;                    // active step's chapter
  doneChapters: Chapter[];             // chapters fully behind the claimant
  dots: { count: number; index: number } | null;  // steps within the current chapter; null on intro
  isTapStep: boolean;                  // tap steps hide the המשך button (auto-advance)
  backDisabled: boolean;
  onBack: () => void;
  nextLabel: string;                   // "בוא נתחיל" | "המשך" | "שולח…" | "שליחה לסוכן"
  nextDisabled: boolean;
  onNext: () => void;
  nextVariant: "primary" | "submit";   // blue vs green
  requiredHint: boolean;               // show the fill-required-fields amber line
  children: React.ReactNode;
};
export default function WizardShell(props: ShellProps): JSX.Element;

export function MilestoneScreen(props: {
  finishedChapter: "quick" | "details";
  onContinue: () => void;
}): JSX.Element;
```

No unit test (repo convention for client components; verified in Task 5). Type bump lives here and in Task 4's step extraction: base text `text-lg` (18px), headings `text-2xl`, buttons `py-3.5` / min-height ≥48px.

- [ ] **Step 1: Implement** `WizardShell.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { CHIP_LABEL, TIME_LEFT, type Chapter } from "./steps";

export type ShellProps = {
  chapter: Chapter;
  doneChapters: Chapter[];
  dots: { count: number; index: number } | null;
  isTapStep: boolean;
  backDisabled: boolean;
  onBack: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  onNext: () => void;
  nextVariant: "primary" | "submit";
  requiredHint: boolean;
  children: ReactNode;
};

const CHIP_ORDER: ("quick" | "details" | "finish")[] = ["quick", "details", "finish"];

// The wizard's frame: chapter chips + in-chapter dots on top (never "שלב X מתוך 11"),
// step content, required-fields hint, back/next nav, and the persistent reassurance
// footer (spec §4). Tap steps auto-advance, so their המשך button is hidden.
export default function WizardShell(p: ShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-5 text-lg">
      <div className="mb-6">
        <div className="flex items-center justify-center gap-2">
          {CHIP_ORDER.map((c) => {
            const done = p.doneChapters.includes(c);
            const active = p.chapter === c;
            return (
              <span
                key={c}
                className={`rounded-full px-3 py-1 text-sm ${
                  done
                    ? "bg-green-100 text-green-700"
                    : active
                      ? "bg-blue-600 font-medium text-white"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {done && "✓ "}
                {CHIP_LABEL[c]}
              </span>
            );
          })}
        </div>
        {p.dots && (
          <div className="mt-3 flex justify-center gap-1.5">
            {Array.from({ length: p.dots.count }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i < p.dots!.index ? "bg-green-400" : i === p.dots!.index ? "bg-blue-600" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
        )}
        <p className="mt-2 text-center text-sm text-zinc-400">{TIME_LEFT[p.chapter]}</p>
      </div>

      <div className="flex-1">{p.children}</div>

      {p.requiredHint && (
        <p className="mt-3 text-center text-sm text-amber-600">
          יש למלא את שדות החובה המסומנים בכוכבית (*)
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={p.onBack}
          disabled={p.backDisabled}
          className="min-h-12 rounded-lg px-4 py-2 text-zinc-600 disabled:opacity-40"
        >
          חזרה
        </button>
        {!p.isTapStep && (
          <button
            type="button"
            onClick={p.onNext}
            disabled={p.nextDisabled}
            className={`min-h-12 flex-1 rounded-lg px-4 py-3.5 font-medium text-white disabled:opacity-40 ${
              p.nextVariant === "submit" ? "bg-green-600" : "bg-blue-600"
            }`}
          >
            {p.nextLabel}
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400">
        התשובות נשמרות — אפשר לעצור ולחזור לקישור בכל שלב
      </p>
    </div>
  );
}

export function MilestoneScreen({
  finishedChapter,
  onContinue,
}: {
  finishedChapter: "quick" | "details";
  onContinue: () => void;
}) {
  const line =
    finishedChapter === "quick"
      ? { title: "החלק הראשון מאחוריך!", sub: "עוד כ־2 דקות וסיימנו" }
      : { title: "כמעט שם!", sub: "נשארו רק מסמכים וסיכום — עוד כדקה" };
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl">🎉</div>
      <h2 className="mt-4 text-2xl font-bold">{line.title}</h2>
      <p className="mt-2 text-lg text-zinc-500">{line.sub}</p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-8 min-h-12 w-full rounded-lg bg-blue-600 px-4 py-3.5 text-lg font-medium text-white"
      >
        ממשיכים
      </button>
    </div>
  );
}
```

- [ ] **Step 2:** `npx eslint src/components/collection/WizardShell.tsx` and `npx tsc --noEmit` — clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/collection/WizardShell.tsx
git commit -F <msgfile>   # "feat: WizardShell — chapter chips, dots, milestones, larger type"
```

---

### Task 4: Recompose `CollectionWizard` — extract steps, wire registry + auto-advance + persistence v2

This is the integration task. The step JSX moves **verbatim** (same Hebrew copy, same handlers) from `CollectionWizard.tsx` into per-step files; only the type-size classes change (`text-xl`→`text-2xl` headings, `text-sm`→`text-base` labels/help where they are user-read paragraphs; keep `text-xs` fine print).

**Files:**
- Create: `web/src/components/collection/steps/fields.tsx` — the shared `Text`, `Choice`, `DocField`, `Row` components move here (from CollectionWizard.tsx lines ~84–149, ~784–848, and the `Row` definition near the summary). `Choice` gains an optional `autoAdvanceHint?: boolean` no-op prop ONLY if needed by styling — otherwise unchanged.
- Create (one per step; props listed below): `steps/IntroStep.tsx`, `steps/InjuriesStep.tsx`, `steps/DriverWhoStep.tsx`, `steps/FaultStep.tsx`, `steps/TpPresentStep.tsx`, `steps/VehicleStep.tsx`, `steps/InsuredStep.tsx`, `steps/DriverDetailsStep.tsx`, `steps/TpDetailsStep.tsx`, `steps/WhenWhereStep.tsx`, `steps/DescriptionStep.tsx`, `steps/DocumentsStep.tsx`, `steps/SummaryStep.tsx`
- Modify: `web/src/components/collection/CollectionWizard.tsx` (shrinks to state + effects + composition)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Step component props (exact):
  - Common: `{ s: State; set: (patch: Partial<State>) => void }`
  - Tap steps additionally: `{ advance: () => void }` — the step calls `advance()` after `set(...)` on a choice tap. **InjuriesStep exception:** calls `advance()` only for "אין נפגעים"; for "יש נפגעים" it renders the existing 101/100 warning and the shell's המשך must appear — implemented by CollectionWizard passing `isTapStep: false` to the shell when `key === "injuries" && s.injuries === true` (the registry's static flag stays true; the shell prop is computed).
  - `VehicleStep`: `+ { lookup: "idle" | "looking" | "found" | "missing"; plateWarn: (v: string) => string | undefined }`
  - `InsuredStep`: `+ { idWarn: (v: string) => string | undefined }` (renders the insurer + insurance-type selects too — old step 2 verbatim)
  - `DriverDetailsStep`: `+ { idWarn }` — old step 3's conditional block, now standalone with heading `פרטי הנהג`+ explanatory line "ציינת שמישהו אחר נהג — כמה פרטים עליו/עליה".
  - `TpDetailsStep`: `+ { plateWarn; tpInsurerCustom: boolean; setTpInsurerOther: (v: boolean) => void }` — old step 8's conditional block, standalone with heading `פרטי הצד השני`.
  - `WhenWhereStep`: `+ { geoBusy: boolean; geoError: string | null; useMyLocation: () => void }`
  - `DocumentsStep`: `+ { onPick: (type: DocType, files: FileList) => void; onRemove: (localId: string) => void }`
  - `SummaryStep`: `+ { goTo: (key: StepKey) => void; docDone: number; submitError: string | null }` — edit rows call `goTo("insured")`, `goTo("vehicle")`, `goTo("driver_who")`, `goTo("when_where")` (×2), `goTo("description")`, `goTo("fault")`, `goTo("injuries")`, `goTo("documents")`.

**CollectionWizard wiring (the heart of the task):**

- [ ] **Step 1:** Replace `const [step, setStep] = useState(0)` with `const [stepKey, setStepKey] = useState<StepKey>("intro")` and `const [milestone, setMilestone] = useState<"quick" | "details" | null>(null)`. Derive:

```ts
const visible = visibleSteps(s);
const idx = Math.max(0, visible.findIndex((st) => st.key === stepKey));
const active = visible[idx];
const chapterSteps = visible.filter((st) => st.chapter === active.chapter);
const dots = active.chapter === "intro" ? null : { count: chapterSteps.length, index: chapterSteps.findIndex((st) => st.key === stepKey) };
const doneChapters = (["quick", "details", "finish"] as const).filter(
  (c) => visible.filter((st) => st.chapter === c).every((st) => visible.indexOf(st) < idx),
);
```

- [ ] **Step 2:** Navigation:

```ts
function goNext() {
  const next = visible[idx + 1];
  if (!next) return;
  // Crossing a chapter boundary out of quick/details → milestone interstitial first.
  if (next.chapter !== active.chapter && (active.chapter === "quick" || active.chapter === "details")) {
    setMilestone(active.chapter);
  }
  setStepKey(next.key);
}
function goBack() {
  if (idx > 0) setStepKey(visible[idx - 1].key);
}
const advance = () => setTimeout(goNext, 250);  // tap-step auto-advance (selected-state flash)
```

Milestone renders INSTEAD of the shell when `milestone !== null` (via `<MilestoneScreen finishedChapter={milestone} onContinue={() => setMilestone(null)} />`) — the step behind it is already the next chapter's first step, so continue just dismisses. Milestones are not persisted (spec §3): the save effect stores `stepKey` only.

- [ ] **Step 3:** Persistence wiring: restore effect uses the new `loadWizardState(token, mergeWithEmpty(prefill))` → `if (saved) { setS(saved.state); setStepKey(saved.stepKey ?? firstIncompleteKey(saved.state)); }`. Save effect calls `saveWizardState(token, stepKey, s)`. A restored `stepKey` that is no longer relevant (e.g. saved on `driver_details`, then state says insured drove) resolves via the `Math.max(0, findIndex...)` guard → falls back to index 0; better: if `findIndex === -1`, `setStepKey(firstIncompleteKey(s))` in the restore path — implement that.
- [ ] **Step 4:** Shell wiring: `canNext` switch is DELETED — `nextDisabled = !active.isComplete(s)` for non-summary steps; summary keeps `submitBusy || !s.declaration.data_consent` on the green submit button (`nextVariant: "submit"`, `nextLabel: submitBusy ? "שולח…" : "שליחה לסוכן"`, `onNext: handleSubmit`). Intro: `nextLabel: "בוא נתחיל"`. `requiredHint`: non-tap, non-summary, non-documents steps where `!active.isComplete(s)`. `isTapStep` shell prop: `active.isTapStep && !(active.key === "injuries" && s.injuries === true)`.
- [ ] **Step 5:** The plate-lookup effect's `if (step !== 4) return;` becomes `if (stepKey !== "vehicle") return;` (dep array updates to `stepKey`). The done-screen and doc upload/geo/submit functions move unchanged.
- [ ] **Step 6:** Verify from `web/`: `npm run lint` (no NEW warnings), `npx tsc --noEmit`, `npm run build`, `npx vitest run` — all clean/passing.
- [ ] **Step 7: Commit**

```bash
git add web/src/components/collection
git commit -F <msgfile>   # "feat: chaptered tap-first collection wizard — registry-driven steps"
```

---

### Task 5: Manual mobile verification

- [ ] **Step 1:** Build + serve the branch (production build; see repo memory: `npm run build` then `npm run start -- --port 3101`; `next dev` may refuse while the user's dev server runs). Open the Browser pane at a fresh claim's `/c/<token>` link (create a claim via the dashboard if needed), `resize_window` to mobile (375px).
- [ ] **Step 2:** Verify, fixing anything broken: intro → "בוא נתחיל"; four quick taps auto-advance (~250ms) with no המשך button; injuries=כן shows the warning AND a המשך button; milestone 🎉 after tp_present and after description; chips/dots/time-left update; driver_details appears only when "מישהו אחר" was tapped; tp_details only when צד שני=כן; plate lookup still auto-fills on the vehicle step; 📍 still fills location; summary edit rows jump to the right steps and back; declaration gate + submit → done screen; RTL and 18px type throughout.
- [ ] **Step 3:** Resume tests: refresh mid-chapter-2 → returns to the same step; simulate a v1 blob (`localStorage.setItem('claim-wizard:v1:<token>', JSON.stringify({step: 4, state: <copied current v2 state>}))` after clearing v2) → reload resumes at the first incomplete step, v1 key gone.
- [ ] **Step 4:** Commit any fixes (`fix: …`).

---

### Task 6: PR

- [ ] **Step 1:** `git push -u origin feat/collection-lightness`
- [ ] **Step 2:** `gh pr create` with `--body-file` (PowerShell mangles inline Hebrew): what changed (chapters, tap-first + auto-advance, milestones, type bump, file split, persistence v2 + migration), spec link (PR #47), "no schema/API changes", and the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` footer. Leave the PR for the user to review/merge.
