# No-repair third-party claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a handler mark a `third_party_report` claim as no-repair ("דו"ח גלובלי"), so the checklist, readiness, chase and tasks stop requiring repair artefacts.

**Architecture:** New boolean column `claims.no_repair`, carried in `ClaimFlags` and filtered in the pure `computeChecklist` (same pattern as `policy_activated`). A new `PATCH /api/claims/[id]/flags` route — the first app-side flag writer — flips it and re-runs the task engine with a new `flags_changed` event. A cockpit toggle calls the route.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-no-repair-global-claim-design.md`

## Global Constraints
- Worktree `.claude/worktrees/no-repair`, branch `feat/no-repair-global-claim`; run from `web/`. Fresh worktree has no `node_modules` (junction or `npm ci`).
- English identifiers, Hebrew UI strings. Toggle label exactly: `ללא תיקון (תביעה לפי אומדן)`.
- No-repair task title exactly: `לאסוף דוח שמאי ומסמכי הגשה`.
- Migration is **not** auto-applied — the PR body and `docs/status.md` must say so.
- The flags route accepts **only** `no_repair`; other flags stay unwritable.

## Review Focus
- Flag flipped on a non-`third_party_report` claim → no checklist change (flag ignored elsewhere). Test in Task 1.
- Flip on → off mid-claim with invoice already uploaded → invoice item reappears as done, nothing lost. Test in Task 1.
- Flag on clears the last blocker → `submit_to_tp_insurer` spawns and `collect_private_report_docs` completes on the `flags_changed` event. Test in Task 2.
- Body `{ no_repair: "yes" }` or `{ theft: true }` → 400, no write. Test in Task 3.
- Claim the user doesn't own (RLS select returns null) → 404, no write. Test in Task 3.

---

### Task 1: Column, flag type, checklist filter

**Files:**
- Create: `web/db/migrations/017_claim_no_repair.sql`
- Modify: `web/db/schema.sql` (claims table, next to `garage_network_rider`)
- Modify: `web/src/lib/claims/checklist.ts` (`ClaimFlags`, `computeChecklist`)
- Modify every flag reader so `tsc` passes: `app/dashboard/[id]/page.tsx`, `app/c/[token]/page.tsx`, `lib/brief/brief.ts`, `lib/brief/facts.ts`, `lib/outbound/load.ts`, `lib/submission/build.ts`, `lib/tasks/runner.ts` — add `no_repair` to each select string and `no_repair: !!x.no_repair` to each flags object.
- Test: `web/src/lib/claims/checklist.test.ts` (+ fix `NO_FLAGS`/`FLAGS` fixtures in other tests)

**Interfaces:**
- Produces: `ClaimFlags.no_repair: boolean`; constant `NO_REPAIR_DROPPED_KEYS = ["garage_invoice", "repair_receipt", "car_at_garage"] as const` exported from `checklist.ts`.

- [ ] **Step 1: Failing tests** in `checklist.test.ts`, `describe("no_repair")`:
  - `drops repair items on third_party_report` — keys of `computeChecklist("third_party_report", new Set(), false, {}, {...NO_FLAGS, no_repair: true})` contain none of `garage_invoice`, `repair_receipt`, `car_at_garage`, and still contain `appraiser_report`, `assessor_fee_invoice`, `assessor_fee_receipt`, `demand_form`, `bank_details`, `no_claim_confirmation`.
  - `ignored on other tracks` — `own_policy` and `third_party_settlement` key lists equal with flag on vs off.
  - `flip back restores invoice as done` — with `new Set(["garage_invoice"])` and flag off, `garage_invoice` item exists with `done: true`.
  - `no repair blockers remain` — with flag on and all other blocking docs + form present, `items.some(i => i.blocking && !i.done)` is false.
- [ ] **Step 2:** `npx vitest run src/lib/claims/checklist.test.ts` → FAIL (type error / items present).
- [ ] **Step 3:** Add flag + filter inside the existing `if (claimType === "third_party_report")` block; migration `ALTER TABLE claims ADD COLUMN IF NOT EXISTS no_repair boolean NOT NULL DEFAULT false;` with a header comment in the 004 style; schema.sql; all readers.
- [ ] **Step 4:** `npx vitest run` and `npx tsc --noEmit` → all pass. Also `npm run test:scripts` (migration guard).
- [ ] **Step 5:** Commit `feat(claims): no_repair flag drops repair items from third_party_report checklist`.

### Task 2: Engine — `flags_changed` event + flag-aware task title

**Files:**
- Modify: `web/src/lib/tasks/types.ts` (`EngineEvent`, `EngineInput.claim`)
- Modify: `web/src/lib/tasks/templates.ts` (`RuleCtx`, `TaskRule.title`, `collect_private_report_docs`)
- Modify: `web/src/lib/tasks/engine.ts` (`buildRuleCtx`, spawn title)
- Modify: `web/src/lib/tasks/runner.ts` (pass `noRepair: !!claim.no_repair`)
- Test: `web/src/lib/tasks/engine.test.ts`

**Interfaces:**
- Produces: `EngineEvent` gains `{ type: "flags_changed" }`; `EngineInput.claim.noRepair: boolean`; `RuleCtx.noRepair: boolean`; `TaskRule.title: string | ((ctx: RuleCtx) => string)`.

- [ ] **Step 1: Failing tests** in `engine.test.ts`:
  - `no-repair title` — tp_report, `noRepair: true`, event `track_confirmed`, missing appraiser report → spawned `collect_private_report_docs` has title `לאסוף דוח שמאי ומסמכי הגשה`; with `noRepair: false` the title is unchanged from today.
  - `flags_changed clears last blocker` — tp_report checklist computed with `no_repair: true`, all non-repair blocking docs + form present, open task `collect_private_report_docs`, event `flags_changed` → `complete` contains `id-collect_private_report_docs` and `spawn` contains `submit_to_tp_insurer`.
- [ ] **Step 2:** `npx vitest run src/lib/tasks/engine.test.ts` → FAIL.
- [ ] **Step 3:** Implement; resolve title as `typeof rule.title === "function" ? rule.title(ctx) : rule.title`. Fix any exhaustive `switch (event.type)` the compiler flags (no status advance for `flags_changed`). Existing tests' `run()` helper gets `noRepair: false` default.
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit` → pass.
- [ ] **Step 5:** Commit `feat(tasks): flags_changed event and no-repair task title`.

### Task 3: `PATCH /api/claims/[id]/flags`

**Files:**
- Create: `web/src/app/api/claims/[id]/flags/route.ts`
- Test: `web/src/app/api/claims/[id]/flags/route.test.ts` (chain-fake style of `app/api/claims/[id]/route.test.ts`)

**Interfaces:**
- Consumes: `runEngine(id, { type: "flags_changed" })` from Task 2.
- Produces: `PATCH` body `{ no_repair: boolean }` → `200 { ok: true, no_repair: boolean }`.

- [ ] **Step 1: Failing tests:** 401 without user; 400 for `{}`, `{ no_repair: "yes" }`, `{ theft: true }`, and `{ no_repair: true, theft: true }` (any extra key rejected); 404 when RLS select returns null; happy path writes `claims.update({ no_repair: true })`, inserts one `claim_events` row `{ type: "flags_changed", payload_json: { no_repair: true } }`, calls `runEngine` once; no event row when value unchanged.
- [ ] **Step 2:** `npx vitest run "src/app/api/claims/[id]/flags"` → FAIL.
- [ ] **Step 3:** Mirror `checklist/route.ts`: auth client for user + ownership select (`id, no_repair`), service client for write and event, `serverError`/`reportError` from `@/lib/observability/report`. Check `claim_events.type` is free text vs enum in `schema.sql`; if enum, add the value in migration 017.
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit` → pass.
- [ ] **Step 5:** Commit `feat(api): PATCH claim flags (no_repair only)`.

### Task 4: Cockpit toggle

**Files:**
- Create: `web/src/app/dashboard/[id]/NoRepairToggle.tsx` (client component)
- Modify: `web/src/app/dashboard/[id]/page.tsx` — render above the `view="core"` `ChecklistPanel`, only when `claim.claim_type === "third_party_report"`.

**Interfaces:**
- Consumes: Task 3 route.
- Produces: `NoRepairToggle({ claimId: string; initial: boolean })`.

- [ ] **Step 1:** Checkbox labelled `ללא תיקון (תביעה לפי אומדן)`, disabled while pending, PATCH then `router.refresh()`; on non-OK revert and show `לא הצלחנו לשמור — נסו שוב`. Follow the styling of `ClaimTypeConfirm.tsx`. Read `web/node_modules/next/dist/docs/` for `useRouter`/refresh in v16 before writing.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` → green (paste output).
- [ ] **Step 3:** Browser check on dev (only if migration 017 is applied to dev; otherwise record as unverified): toggle on a TP-report claim → invoice/receipt/car-at-garage disappear; toggle off → back.
- [ ] **Step 4:** Commit `feat(cockpit): no-repair toggle on third-party report claims`.

### Task 5: Docs + PR

- [ ] `docs/claim-management.md`: under `third_party_report`, add a "Fork: ללא תיקון (`no_repair`)" note next to the `policy_activated` fork — flow, dropped items, open VAT assumption.
- [ ] `docs/status.md`: migration 017 in the manual-migration checklist.
- [ ] Commit, push, `gh pr create --base main` with migration warning at the top of the body.
