# Claim Handling (post-send lifecycle + prepare-and-confirm submission) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take a submittable claim through prepare-and-confirm email submission to the insurer and an evidence-gated handling lifecycle (sent → … → paid/rejected/closed), third-party first.

**Architecture:** Two new pure modules (`web/src/lib/handling/`, `web/src/lib/submission/`) following the repo's pure-logic + thin-route pattern; one additive migration (`011`); two new API routes; UI = one cockpit panel + one status dialog + derive/compose integration. The existing task engine is untouched — it is driven via the same `milestone_ticked` events it already consumes.

**Tech Stack:** Next.js 16 (read `web/node_modules/next/dist/docs/` before route/component work), TypeScript, Supabase (Postgres/RLS/Storage), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-claim-handling-design.md`

## Global Constraints

- Branch + PR off `origin/main` in a worktree under `.claude/worktrees/` (`superpowers:using-git-worktrees`); never switch branches in the main checkout; no self-merge.
- Migration `011` is hand-applied to dev Supabase during the work and must end with `insert into public.schema_migrations(version) values ('011') on conflict do nothing;`; fold every schema change into `web/db/schema.sql` (snapshot convention); call out prod application in the PR.
- Hebrew UI strings live in `copy.ts` modules; English identifiers everywhere else.
- All commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Done-bar: `npx tsc --noEmit`, `npm run test -- --run`, `npm run build` green in `web/` before any completion claim (`done-bar-build-first` memory).
- Run commands from the worktree's `web/` dir; a fresh worktree has no `node_modules` (`npm install` first).

## Review Focus

Spec-implied failure modes not exercised by the per-task tests below; each gets its test added to the owning task:

1. **Two tabs race a handling transition** — second write must not blindly overwrite; the route compare-and-sets on the `from` status it validated and answers 409 on mismatch. (Task 3)
2. **Legacy pilot claim (milestone hand-ticked, `handling_status` null) transitions directly** — the route must derive `from='sent'` via `effectiveHandling`, not reject with "from null, to paid illegal". (Tasks 2+3)
3. **`unknown`-track claim reaches the prepare surface** — `composeSubmission` returns `null` and the panel renders nothing; it must not throw on missing track/insurer. (Task 5)
4. **Manual recipient with junk input** — leading/trailing whitespace trimmed; a recipient that is not a plausible email (`x@y.z` shape) is refused by the confirm route, so a PII packet can't be "confirmed sent" to garbage. (Task 6)
5. **Clipboard API rejection** (older desktop app webviews) — copy buttons fall back to selecting the text instead of silently doing nothing. (Task 7, manual verification step — not unit-testable in jsdom-less Vitest setup)

---

### Task 1: Migration 011 + schema snapshot

**Files:**
- Create: `web/db/migrations/011_claim_handling.sql`
- Modify: `web/db/schema.sql` (doc_type enum list ~line 10-25; `claims` table ~line 46-69)

**Interfaces:**
- Produces: `claims.handling_status text null` (CHECK in `('sent','docs_requested','approved_awaiting_payment','partial_paid','paid','rejected','appeal','legal')`), `claims.handling_status_changed_at timestamptz null`, doc_type values `payment_notice`, `rejection_letter`.

- [ ] **Step 1: Write `011_claim_handling.sql`** — `alter type doc_type add value if not exists 'payment_notice';` + same for `'rejection_letter'`; `alter table claims add column if not exists handling_status text, add column if not exists handling_status_changed_at timestamptz;` + a named CHECK constraint added via `do $$ … if not exists` guard (constraint name `claims_handling_status_check`); end with the `schema_migrations` row for `'011'`. Every statement re-runnable.
- [ ] **Step 2: Fold into `web/db/schema.sql`** — the two enum values appended with a `-- added by migration 011` comment; the two columns + inline CHECK on the `claims` table.
- [ ] **Step 3: Verify SQL by eye against migration-guard rules** — no duplicate `NNN_` number (`ls web/db/migrations/`), file ends with its own schema-version row.
- [ ] **Step 4: Commit** — `git add web/db/… && git commit -m "feat: migration 011 — claim handling status + payment/rejection doc types"`.
- [ ] **Step 5: Ask the user to paste `011` into the dev Supabase SQL editor now** (blocking for later live testing, not for unit tests). Flag that prod application happens at merge per the promote checklist.

### Task 2: Handling domain module (pure)

**Files:**
- Create: `web/src/lib/handling/types.ts`, `transitions.ts`, `effective.ts`, `copy.ts`
- Test: `web/src/lib/handling/transitions.test.ts`, `effective.test.ts`

**Interfaces:**
- Produces:
  - `type HandlingStatus = 'sent' | 'docs_requested' | 'approved_awaiting_payment' | 'partial_paid' | 'paid' | 'rejected' | 'appeal' | 'legal'` (types.ts)
  - `canTransition(from: HandlingStatus | null, to: HandlingStatus): boolean` (transitions.ts) — exactly the spec's legality table.
  - `requirementFor(to: HandlingStatus): { evidenceDoc?: 'payment_notice' | 'rejection_letter'; note?: boolean; lawyer?: boolean }` — `paid`/`partial_paid` ⇒ evidenceDoc `payment_notice`; `rejected` ⇒ `rejection_letter`; `docs_requested`/`appeal` ⇒ `note: true`; `legal` ⇒ `lawyer: true`; others `{}`.
  - `SYSTEM_MILESTONES: ReadonlySet<string>` = `submitted_to_insurer`, `submitted_to_tp_insurer`, `approval_requested`, `payment_received`; `isSystemMilestone(key: string): boolean`.
  - `sentMilestoneFor(claimType: ClaimType): string | null` — `own_policy`→`submitted_to_insurer`, `third_party_report`→`submitted_to_tp_insurer`, `third_party_settlement`→`approval_requested`, `unknown`→`null`.
  - `effectiveHandling(handlingStatus: string | null, checklistState: Record<string, boolean> | null, claimType: ClaimType): HandlingStatus | null` (effective.ts) — column wins; else `'sent'` iff the track's sent-milestone is ticked; else null.
  - `HANDLING_LABEL: Record<HandlingStatus, string>` (copy.ts) — Hebrew: נשלחה למבטחת · המבטחת ביקשה השלמות · אושרה — ממתין לתשלום · תשלום חלקי · שולמה · נדחתה · ערעור · טיפול משפטי.

- [ ] **Step 1: Write failing tests** — `transitions.test.ts`: full legality matrix as a table test (every allowed pair true; representative forbidden pairs false: `null→paid`, `paid→sent`, `rejected→paid`, `partial_paid→rejected`); `requirementFor` per target; `isSystemMilestone` positives + `car_at_garage` negative. `effective.test.ts`: column wins over milestone; null column + ticked `submitted_to_tp_insurer` on `third_party_report` → `'sent'`; ticked milestone of the *wrong* track → null; `unknown` track always null-unless-column.
- [ ] **Step 2: Run tests, verify FAIL** — `npm run test -- --run handling` → modules not found.
- [ ] **Step 3: Implement the four files** per the interfaces above.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit.**

### Task 3: `PATCH /api/claims/[id]/handling` route

**Files:**
- Create: `web/src/app/api/claims/[id]/handling/route.ts`
- Create: `web/src/lib/handling/apply.ts` + Test: `web/src/lib/handling/apply.test.ts`

**Interfaces:**
- Consumes: Task 2 (`canTransition`, `requirementFor`, `effectiveHandling`, `sentMilestoneFor`); existing `runEngine(claimId, event)` (`web/src/lib/tasks/runner.ts`); auth/RLS/service-client pattern copied from `web/src/app/api/claims/[id]/checklist/route.ts`.
- Produces: `PATCH` body `{ to: HandlingStatus, note?: string, lawyer?: { name: string, phone?: string, email?: string } }` → 200 `{ ok: true, handling_status }`; 400 on illegal transition / missing requirement (Hebrew `error` naming what's missing, from `copy.ts` additions `REQUIREMENT_ERROR`); 409 on concurrent-change; 404/401 as the checklist route. Also body `{ close: { reason: 'paid_closed'|'rejected_final'|'for_information'|'other', note?: string } }` instead of `to` → sets `claims.status='closed'`, `closed_at`, stores under `summary_json.handling.closure`, event `claim_closed`.
- `apply.ts` (pure, unit-testable): `planHandlingUpdate(input: { to | close, note?, lawyer?, current: { handling_status, checklist_state, claim_type, status }, docs: { type: string }[] , now: Date }) → { error: string } | { update: {...columns}, summaryPatch?: object, event: { type, payload }, milestoneTick?: string }` — the route is I/O glue around it.

- [ ] **Step 1: Write failing `apply.test.ts`** — legal `sent→paid` with a `payment_notice` doc returns update + `milestoneTick:'payment_received'`; `sent→paid` without the doc returns Hebrew error naming הודעת תשלום; `partial_paid` with doc returns **no** milestoneTick (spec: only `paid` ticks); `rejected` without `rejection_letter` errors; `docs_requested` without note errors; `legal` without lawyer errors; legacy claim (`handling_status: null`, milestone ticked) `→paid` succeeds (Review-Focus 2); close with reason produces status-closed update + closure summaryPatch.
- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement `apply.ts`, then the route** — route reads claim via auth client (`handling_status, checklist_state, claim_type, status, summary_json`), reads `claim_documents` types, calls `planHandlingUpdate`, writes via service client with `.eq('handling_status', currentValue)` compare-and-set (null-safe: `.is()` when null) and answers 409 when no row updated (Review-Focus 1); inserts the `claim_events` row; when `milestoneTick` present, merges `checklist_state` and calls `runEngine(id, { type:'milestone_ticked', key, done:true })`.
- [ ] **Step 4: Run tests + `npx tsc --noEmit`, verify PASS.**
- [ ] **Step 5: Commit.**

### Task 4: Close the manual-tick backdoor

**Files:**
- Modify: `web/src/app/api/claims/[id]/checklist/route.ts` (after body validation, ~line 27)
- Modify: the checklist UI component that renders milestone rows (`ChecklistPanel` — locate under `web/src/app/dashboard/[id]/` or `web/src/components/`)
- Test: extend `web/src/lib/handling/transitions.test.ts` (guard set already covered) — route change is 3 lines using `isSystemMilestone`.

**Interfaces:**
- Consumes: `isSystemMilestone` (Task 2).
- Produces: checklist PATCH answers 403 `{ error: "אבן דרך זו מתעדכנת אוטומטית — דרך מסך השליחה או עדכון הסטטוס" }` for system milestones; milestone rows for those keys render as read-only text + the same hint instead of a toggle.

- [ ] **Step 1: Add the route guard** (403 before any write).
- [ ] **Step 2: Make the UI rows read-only** for `isSystemMilestone` keys (import the set; keep styling consistent with disabled state; hint text from `handling/copy.ts` as `SYSTEM_MILESTONE_HINT`).
- [ ] **Step 3: `npx tsc --noEmit` + run full Vitest — verify green** (no existing test asserts manual ticking of these keys; if one does, update it to expect 403 semantics at the pure layer).
- [ ] **Step 4: Commit.**

### Task 5: Submission module (pure)

**Files:**
- Create: `web/src/lib/submission/directory.ts`, `subject.ts`, `body.ts`, `compose.ts`, `match.ts`
- Test: `web/src/lib/submission/submission.test.ts` (one file covering subject/body/compose/match, mirroring `outbound/` test granularity)

**Interfaces:**
- Consumes: `INSURERS` + canonical insurer keys from `web/src/lib/collection/claim-state.ts`; `computeChecklist` output type; `toILDate` from `web/src/lib/dates.ts`.
- Produces:
  - `INSURER_DIRECTORY: Record<string, { label: string; claimsEmail: string | null; cc: string[]; verified: boolean }>` — every `claimsEmail: null`, `verified: false`; the ClaimAI-observed הפניקס addresses (`ea5070@fnx.co.il`, CC `tviotrechev@fnx.co.il`) appear **only in a comment** per the spec.
  - `matchInsurer(freeText: string | null): string | null` (match.ts) — trim, strip quotes/geresh variants, exact match against directory labels + keys; no fuzzy.
  - `buildSubject(c: SubmissionClaim): string` — TP tracks: `תביעת נזקי רכוש — אירוע מיום {dd/mm/yyyy} — מבוטחכם {tp_plate} — נפגע {our_plate} — {shortId}`; own-policy: `הודעה על תאונה — פוליסה — אירוע מיום {date} — רכב {our_plate} — {shortId}`; settlement: `בקשת הסדר — אירוע מיום {date} — מבוטחכם {tp_plate} — {shortId}`. `shortId` = first 8 chars of claim UUID. Missing plate renders `לא ידוע`.
  - `buildBody(c: SubmissionClaim): string` — Hebrew cover note: agency name line, one event line, `המסמכים המצורפים:` bulleted from `attachments` labels, request line per track, contact line. Deterministic, no LLM.
  - `composeSubmission(input: { claim: SubmissionClaim; checklist: ComputedItem[]; docs: DocRow[]; forms: FormRow[] }): Submission | null` — null when track `unknown` (Review-Focus 3). `Submission = { insurerKey: string | null; recipient: string | null; cc: string[]; verified: boolean; subject: string; body: string; attachments: { label: string; storagePath: string }[] }`; attachments = latest generated accident-notice form + every uploaded doc whose checklist item is mandatory for the track, each with its Hebrew checklist label.
  - `SubmissionClaim` type: `{ id, claimType, clientName, ourPlate, tpPlate, eventDate, atFaultInsurer, policyInsurer, agencyName }` — built by the caller (cockpit page) from existing queries.

- [ ] **Step 1: Write failing tests** — subject per track incl. missing-plate fallback and dd/mm/yyyy; body lists exactly the passed attachments' labels; compose returns null on `unknown`; compose picks recipient from directory only when `verified` (always null-recipient with the shipped directory — assert `recipient === null`, `insurerKey` still set); `matchInsurer('הפניקס ')` → phoenix key, `matchInsurer('פניקס!')` → null.
- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement the five files.**
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit.**

### Task 6: Confirm-send route

**Files:**
- Create: `web/src/app/api/claims/[id]/submission/route.ts`
- Create: `web/src/lib/submission/confirm.ts` + Test: `web/src/lib/submission/confirm.test.ts`

**Interfaces:**
- Consumes: `sentMilestoneFor` (Task 2); `runEngine`; auth/RLS pattern as Task 3.
- Produces: `POST` body `{ recipient: string, subject: string, insurerKey?: string }` → validates recipient (`confirm.ts`: `validRecipient(s: string): string | null` — trims, requires `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, returns normalized or null; Review-Focus 4); refuses track `unknown` (400) and already-sent (`effectiveHandling` non-null → 409). Writes: `at_fault_insurer = insurerKey` (TP tracks, when provided), `handling_status='sent'` + `handling_status_changed_at`, ticks `sentMilestoneFor(claimType)` in `checklist_state`, `claim_events` row `submission_confirmed` `{ recipient, subject, insurerKey }`, then `runEngine(id, { type:'milestone_ticked', key, done:true })`. 200 `{ ok: true }`.

- [ ] **Step 1: Write failing `confirm.test.ts`** — `validRecipient(' a@b.co ')` → `'a@b.co'`; `'not-an-email'` → null; plus a pure `planConfirm` (same pattern as `planHandlingUpdate`) covering unknown-track refusal, already-sent refusal via ticked milestone, and the produced update/event/milestone for each track (settlement → `approval_requested`).
- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement `confirm.ts` + the route.**
- [ ] **Step 4: Run tests + `npx tsc --noEmit`, verify PASS.**
- [ ] **Step 5: Commit.**

### Task 7: Prepare panel UI (cockpit)

**Files:**
- Create: `web/src/app/dashboard/[id]/SubmissionPanel.tsx` (client component)
- Modify: `web/src/app/dashboard/[id]/page.tsx` (compose the `Submission` server-side, pass as prop; render inside the עבודה על התיק tab panel)
- Modify: `web/src/lib/submission/copy.ts` (create — panel strings)

**Interfaces:**
- Consumes: `composeSubmission` (Task 5), `POST /api/claims/[id]/submission` (Task 6), `INSURERS` for the select.
- Produces: collapsible panel "שליחה למבטחת": insurer select (prefilled via `matchInsurer` on the TP free text; own-policy shows the fixed `policy_insurer`), recipient — read-only when directory-verified, free input otherwise with "אין כתובת מאומתת — הזינו ידנית"; subject + body blocks each with a copy button (clipboard → select-fallback, Review-Focus 5); attachment list as signed-URL download links (reuse the existing signed-URL mechanism from the קבצים tab); confirm button "סומן כנשלח" disabled until recipient valid, with an inline are-you-sure second tap (no `confirm()`), then POST + router refresh.

- [ ] **Step 1: Implement panel + page wiring.** Panel hidden when `composeSubmission` returned null or claim already effectively sent.
- [ ] **Step 2: `npx tsc --noEmit` + `npm run build` — verify green.**
- [ ] **Step 3: Manual verification in the preview browser** — dev server, a seeded TP claim: panel renders, copy buttons work, confirm flips card to נשלחה and spawns `follow_up_tp_insurer` (check tasks panel). Verify copy-fallback path by forcing `navigator.clipboard` rejection in devtools once.
- [ ] **Step 4: Commit.**

### Task 8: Status dialog UI (cockpit header)

**Files:**
- Create: `web/src/app/dashboard/[id]/HandlingDialog.tsx`
- Modify: `web/src/app/dashboard/[id]/CockpitHeader.tsx` (status badge + entry button)

**Interfaces:**
- Consumes: `canTransition`, `requirementFor`, `HANDLING_LABEL`, `effectiveHandling` (Task 2); `PATCH /api/claims/[id]/handling` (Task 3); existing `POST /api/claims/[id]/documents` for evidence upload.
- Produces: header badge shows `HANDLING_LABEL[effective]` + "· N ימים" (from `handling_status_changed_at`, falling back to days-since for legacy) once effective handling is non-null; "עדכון סטטוס" opens the dialog: target statuses = `canTransition(current, ·)` filtered list as buttons; picking one reveals its requirement (file input → uploads evidence doc first, then PATCH; note textarea; lawyer name/phone/email; closure reason radios for the close action) and a single submit. Upload-then-PATCH failure mid-way leaves the uploaded doc in place and shows the PATCH error — the doc is real evidence either way, state is consistent.

- [ ] **Step 1: Implement dialog + header wiring.**
- [ ] **Step 2: `npx tsc --noEmit` + build — verify green.**
- [ ] **Step 3: Manual verification in the preview browser** — sent claim: mark שולמה without file → Hebrew refusal names הודעת תשלום; upload file + mark → badge שולמה, claim closes, follow-up task completed; mark נדחתה path with rejection letter; close-with-reason from נדחתה.
- [ ] **Step 4: Commit.**

### Task 9: Derive + dashboard integration

**Files:**
- Modify: `web/src/lib/cockpit/derive.ts` + `copy.ts`; Test: `derive.test.ts`, `copy.test.ts`
- Modify: `web/src/lib/dashboard/compose.ts` + `copy.ts`; Test: `compose.test.ts`
- Modify: `web/src/app/dashboard/page.tsx` (pass `handling_status`, `handling_status_changed_at`, `checklist_state` into compose input — extend the existing claims select; no extra query), `ClaimsTable.tsx` (handling-status column via `HANDLING_LABEL`)

**Interfaces:**
- Consumes: `effectiveHandling`, `HANDLING_LABEL` (Task 2).
- Produces: cockpit next-action precedence gains, after the existing chase entry: `prepare_submission` ("להכין שליחה למבטחת") when checklist-submittable ∧ effective handling null ∧ track ≠ unknown, and `update_handling` ("לעדכן סטטוס מול המבטחת") when effective ∈ {sent, docs_requested} ∧ the open `follow_up_*` task is due/overdue (fallback: 14 days since `handling_status_changed_at`). Dashboard card line from `dashboard/copy.ts`: `handlingLine(effective, insurerLabel, days)` → e.g. "נשלחה להפניקס · ממתינים 12 ימים", "המבטחת ביקשה השלמות", "נדחתה — לטפל בערעור". Card uses it as the waiting-line when no action-line won.

- [ ] **Step 1: Write failing tests** — derive: submittable+unsent → `prepare_submission` beats milestone/form actions but loses to classify+chase; sent+overdue follow-up → `update_handling`; paid → neither. compose: card for a sent claim carries the handling line; closed claims unaffected. copy: exact Hebrew strings.
- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run full Vitest + `npx tsc --noEmit`, verify PASS.**
- [ ] **Step 5: Commit.**

### Task 10: Full verification + docs + PR

**Files:**
- Modify: `docs/status.md` (breadcrumb + migration-011 callout), `docs/flow.md` (§2 state machine: handling dimension), `docs/claim-management.md` (handling lifecycle section, Hebrew)

- [ ] **Step 1: Full suite from `web/`** — `npx tsc --noEmit && npm run test -- --run && npm run build`; paste outputs (done-bar).
- [ ] **Step 2: End-to-end walk on dev** per the spec's Acceptance section (TP claim: prepare → confirm → docs_requested → sent → paid; gate refusals; own_policy variant).
- [ ] **Step 3: Update the three docs** — concise deltas only.
- [ ] **Step 4: Push + `gh pr create`** — PR body: summary, migration-011 **prod application required** callout (migration-guard label flow), test evidence, ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
