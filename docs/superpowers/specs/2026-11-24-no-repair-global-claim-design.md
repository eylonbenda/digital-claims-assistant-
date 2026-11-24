# No-repair third-party claim ("דו"ח גלובלי") — design

Date: 2026-11-24 · Status: approved approach, short design

## Intent
A claimant hit by an admitted-fault third party, with minor damage, may choose **not to repair**
and claim the appraiser's estimate (אומדן) from the at-fault insurer. Source: the developer's own
live claim (2026-11). Today `third_party_report` hard-codes repair: the repair invoice is a
blocking doc and the track waits on "רכב נכנס למוסך", so such a claim can never become ready.

Flow: claimant commissions a private appraiser → appraiser inspects and photographs the car,
issues the report → the handler assembles the file and submits it to the at-fault insurer.

## Goals
- A handler can mark a `third_party_report` claim as no-repair; the checklist, readiness, chase
  messages and tasks then stop asking for repair artefacts.
- The decision is usually made at the start but **can flip mid-claim** — both directions must be
  free (no data loss, already-uploaded docs stay).

## Non-goals
- No new `claim_type`. No AI auto-detection of "not repairing" (handler decides).
- `own_policy` estimate claims — not in scope until we have a real case (one-line extension later).
- Payout amount logic (e.g. whether VAT is paid without an invoice) — unverified domain claim,
  recorded as an assumption, not encoded.

## Approaches
1. **Boolean flag `no_repair` on `claims`** (chosen) — mirrors `policy_activated`; filtered in the
   pure `computeChecklist`, so flipping mid-claim is just a recompute. Costs one manual migration.
2. New `claim_type` `third_party_global` — rejected: ~90% duplicate of `third_party_report`, touches
   every track switch (classifier, form-fill, tasks, dashboard), and contradicts the existing
   "policy activation is a flag, not a track" decision.
3. Key inside `checklist_state` jsonb — rejected: no migration, but hides a business fact in the
   milestone-ticks column where every flag reader would miss it.

## Design
- **Migration `016_claim_no_repair.sql`**: `ALTER TABLE claims ADD COLUMN IF NOT EXISTS no_repair
  boolean NOT NULL DEFAULT false;` + `schema.sql`. Applied by hand, dev and prod.
- **`ClaimFlags.no_repair`**; every reader that selects/forwards flags (dashboard page, client
  page, brief, outbound load, submission build, tasks runner, tests) adds it.
- **`computeChecklist`**: on `third_party_report` with `no_repair`, drop `garage_invoice`,
  `repair_receipt` and the `car_at_garage` milestone. Everything else unchanged
  (appraiser report, assessor fee invoice + receipt, demand letter, accident form, vehicle reg,
  photos, bank details, no-claim / loss confirmation, conditionals).
- **First flag writer**: no flag is written anywhere in the app today. Add
  `PATCH /api/claims/[id]/flags` accepting `{ no_repair: boolean }` only (allow-list; other flags
  stay out of scope), auth/ownership like the checklist route, records a `claim_events` row, and
  re-runs the task runner the same way milestone ticks do.
- **Cockpit toggle** on `third_party_report` claims: "ללא תיקון (תביעה לפי אומדן)".
- **Task copy**: `collect_private_report_docs` title says "אחרי התיקון (… חשבונית תיקון)"; with
  `no_repair` it should read "לאסוף דוח שמאי ומסמכי הגשה". Its `completeWhen` already works
  (late section no longer contains the invoice).

## Left to the builder
Exact placement/styling of the toggle; whether the task title becomes a function of ctx or a
second template; test coverage shape (checklist unit tests for both directions + route test).

## Open assumption
Payment by estimate is usually without מע"מ (no invoice) — to verify with an agent before surfacing
it in UI.
