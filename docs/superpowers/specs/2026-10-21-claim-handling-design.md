# Claim handling after the file is ready — post-send lifecycle + prepare-and-confirm submission

**Date:** 2026-10-21 · **Status:** draft, awaiting approval
**Informed by:** the ClaimAI competitor walkthrough (`docs/competitor-claimai.md`, PR #86) — adopt-items #1 (evidence-gated transitions) and #3 (insurer directory + correlation subject), scoped to prepare-and-confirm (no real email sending).

## Intent

Today the product's lifecycle effectively ends at "התיק מוכן": the checklist reaches submittable, the `submit_to_tp_insurer` task fires, and everything after that lives in the פקידה's head plus two freeform milestones (`submitted_to_tp_insurer`, `payment_received`). There is no way to answer "מה קורה עם התביעה מול הפניקס?" from the system, and nothing enforces that a claim marked paid actually has a payment notice in the file.

This feature closes that gap for all tracks, third-party first:

1. **Prepare-and-confirm submission** — the system assembles the complete outgoing submission (recipient address from an insurer directory, correlation-style subject, Hebrew body, attachment list) and the פקידה sends it from her own mailbox; confirming in the app is what flips the claim to "נשלחה".
2. **Post-send handling lifecycle** — a small set of handling statuses from "נשלחה" to money or rejection, where every money/exit transition demands its evidence (payment notice, rejection letter) before the status changes.

Why now: the pilot garage's real pain is the third-party cash cycle — when does the money arrive, which claims are stuck, what is the insurer waiting on. The competitor proves businesses run their whole book on exactly this loop; our differentiation (client-side collection) already exists, so this is the half that makes the product a claim-*management* system.

## Goals

- From a submittable claim, the agent reaches one screen that contains everything needed to send the claim to the right insurer by email: verified recipient, subject, body, attachments. One copy-paste each, then "סומן כנשלח".
- After confirmation, the claim carries a handling status visible on the dashboard card and the cockpit header, with days-in-status.
- The handling statuses are: `sent` → (`docs_requested` ↔ back) → `approved_awaiting_payment` → `partial_paid` → `paid`, with `rejected`, `appeal`, `legal` as exits/branches. Closing a claim records a closure reason.
- Evidence gates: `paid` and `partial_paid` require a `payment_notice` document on file; `rejected` requires a `rejection_letter`; `docs_requested` requires the free-text "מה ביקשו" note; `legal` requires lawyer name + contact; `appeal` requires a reason. The gate is enforced server-side, not just hidden in the UI.
- Existing machinery keeps working unchanged: marking sent ticks the track's `submitted_to_*` milestone (so the task engine's follow-up task spawns exactly as today), and `paid`/`partial_paid` tick `payment_received`.
- The whole flow is auditable: the confirmed subject + recipient and every handling transition land in `claim_events`.

## Non-goals

- No real email sending and no inbound email reading (no OAuth, no SMTP, no Resend). The פקידה's mailbox remains the channel.
- No portal or BAFI automation, no third-party-insurer lookup by plate, no per-insurer analytics dashboards (all tracked separately in the improvement log / competitor doc).
- No demand-letter generation (the `demand_form` doc type stays agent-drafted).
- No changes to the collection wizard or the classifier.

## Anti-goals

- **A status zoo.** ClaimAI shows 17 statuses as 17 tabs; the פקידה needs at most "לשלוח / נשלחה / מחכים לכסף / נגמר". Handling statuses exist in the data model but the UI groups them (see UI section). A design that makes the dashboard busier has failed even if it is more complete.
- **Silent sends.** Nothing leaves or changes state without an explicit per-claim confirmation tap. The ClaimAI bulk-reminder button that fires with no dialog is the counter-example.
- **Lying states.** A claim must never show "שולמה" without the money evidence in the file — that is the entire point of the gates. No admin backdoor that skips them.

## Constraints

- **Migrations are hand-applied** (dev + prod Supabase, see `docs/status.md` promote checklist). Keep schema change to one migration (`011`), additive only, with the `schema_migrations` row convention and `migration-guard` in mind.
- Repo workflow: worktree branch off `origin/main`, PR, no self-merge. Several sessions share the main checkout — no `git switch` there.
- Hebrew UI strings, English identifiers. All user-visible copy lives in a `copy.ts`-style module per the existing pattern (`dashboard/copy.ts`, `cockpit/copy.ts`).
- Next.js 16 — read `web/node_modules/next/dist/docs/` before route/component work.
- The task engine (`web/src/lib/tasks/`) is pure and event-driven; extend it through its existing event + rule vocabulary rather than around it.
- Build is the done-bar: `tsc` + `npm run build` + Vitest green before any completion claim.

## Design decisions (settled)

### 1. Handling status is a new column, not an extension of `claim_status`

`claims.handling_status text null` with a `CHECK` constraint listing the allowed values, plus `handling_status_changed_at timestamptz`. Rationale: `claim_status` is the *collection* lifecycle with a forward-only ordinal (`STATUS_ORDER`) baked into the engine; handling branches (paid vs. rejected) and cycles (`sent` ↔ `docs_requested`), so forcing it into the same enum would break the engine's invariant. Text + CHECK over a Postgres enum because later value additions are a constraint swap in one migration rather than `ALTER TYPE` coordination. `null` means "not yet sent" — every pre-send claim needs no backfill.

Allowed values: `sent`, `docs_requested`, `approved_awaiting_payment`, `partial_paid`, `paid`, `rejected`, `appeal`, `legal`.

**Milestone bridge — only `paid` ticks `payment_received`** *(my call, resolving a real conflict the builder check found)*: the engine closes the claim on that milestone (`engine.ts` advances to `closed`, dashboard hides closed claims), so `partial_paid` must NOT tick it — a partially-paid claim stays open, stays on the dashboard, and `follow_up_*` stays open too, which is correct: money is still owed. `paid` ticks it and the existing close-on-payment behavior is exactly right.

**In-flight pilot claims** *(my call)*: claims sent/paid by hand before this ships have `handling_status null` with milestones already ticked. No SQL backfill; instead the read path derives `effectiveHandling = handling_status ?? (submitted milestone ticked ? 'sent' : null)` in one shared helper, so the cockpit and dashboard read them correctly from day one and the first real transition writes the column.

**Track coverage incl. `third_party_settlement`** *(my call)*: the settlement track joins the same lifecycle with `sent` meaning "בקשת הסדר נשלחה" — the prepare screen gets a settlement-flavored subject/body and its confirm ticks the existing `approval_requested` milestone instead of `submitted_to_*`. The rest of the legality table applies unchanged. `unknown`-track claims can't reach the prepare screen (no track, no recipient logic) — classify first.

Transition legality (enforced in the API route, kept as a pure table so it is unit-testable):

```
null → sent
sent ↔ docs_requested
sent | docs_requested → approved_awaiting_payment | partial_paid | paid | rejected
approved_awaiting_payment → partial_paid | paid | rejected
partial_paid → paid | appeal
rejected → appeal | legal          appeal → paid | partial_paid | rejected | legal
legal → paid | partial_paid        (closing is claim_status='closed' + closure reason, any time)
```

### 2. Evidence gates live in one route

`PATCH /api/claims/[id]/handling` takes `{ to, note?, lawyer? }`. The route:
- validates the transition against the pure legality table;
- checks the evidence precondition against `claim_documents` (`paid`/`partial_paid` ⇒ ≥1 `payment_notice`; `rejected` ⇒ ≥1 `rejection_letter`); the UI uploads the document first via the existing `POST /api/claims/[id]/documents`, then transitions — two calls, one screen;
- requires `note` for `docs_requested` and `appeal`, `lawyer {name, phone|email}` for `legal` (stored in `summary_json.handling`);
- writes `handling_status` + `handling_status_changed_at`, appends a `claim_events` row (`handling_changed`, with from/to/note), and ticks the paired milestone when one exists (`paid`/`partial_paid` → `payment_received`) so the task engine completes `follow_up_*`.

New doc types (migration `011`): `payment_notice` ('הודעת תשלום'), `rejection_letter` ('מכתב דחייה'). Nothing else; a settlement offer or correspondence file goes under `other`.

**The manual-tick backdoor closes** *(my call — the anti-goal demands it)*: once this ships, `PATCH /api/claims/[id]/checklist` refuses manual ticks of `submitted_to_insurer`, `submitted_to_tp_insurer`, `approval_requested` and `payment_received`; their checklist rows render as read-only system milestones pointing at the new flows ("מסומן אוטומטית בשליחה/בעדכון סטטוס"). This changes the פקידה's current habit — the replacement is the same number of taps (confirm-send is one tap; mark-paid is upload + one tap) — flag it in the pilot handoff. Un-ticking stays possible via the same routes' correction paths only.

**Closure reason** *(my call)*: no new column — `{ reason: 'paid_closed' | 'rejected_final' | 'for_information' | 'other', note? }` stored in `summary_json.handling.closure` and echoed in the `claim_events` row. The status dialog gains an explicit "סגירת תביעה" action (needed anyway for the `rejected`/`legal` dead-ends, which never pass through `payment_received`).

### 3. The submission screen is derived, not stored

New pure module `web/src/lib/submission/` (mirrors `outbound/`):
- **TP-insurer canonicalization** *(my call, resolving a gap the builder check found)*: on the third-party tracks the at-fault insurer is free text typed by the client (`third_parties.insurer`), and `claims.at_fault_insurer` is never populated today — so the directory has nothing to key on. The prepare panel therefore carries a canonical-insurer select (the `INSURERS` list + "אחר"), prefilled by normalized exact-match against the client's free text, and persisting the choice to `claims.at_fault_insurer`. Side benefit: the `get_tp_insurer` task's `completeWhen (!!atFaultInsurer)` finally has a writer. No fuzzy matching — a wrong auto-match mis-sends PII; an uncertain match stays empty for the agent to pick.
- `directory.ts` — insurer key → `{ label, claimsEmail: string | null, cc?: string[] , verified: boolean }`. **Ships with every `claimsEmail: null` except any address the user has himself verified.** The ClaimAI-observed הפניקס addresses (`ea5070@fnx.co.il`, CC `tviotrechev@fnx.co.il`) go in the file as a code comment, not as live data — an unverified address mis-sends a PII-heavy claim file, so an insurer with `claimsEmail: null` renders as "אין כתובת מאומתת — הזינו ידנית" with a free-text recipient field. Directory completion is pilot legwork, not code.
- `subject.ts` — deterministic subject per track. Third-party: `תביעת נזקי רכוש — אירוע מיום {dd/mm/yyyy} — מבוטחכם {tp_plate} — נפגע {our_plate} — {claim_short_id}`; own-policy variant references the policy + our plate. The trailing short id (first 8 of the claim UUID) is the correlation key the subject carries for a future inbound-email phase, and is harmless to a human reader today.
- `body.ts` — Hebrew cover-note builder in the `wa.ts` style: who we are (agency name), the event in one line, the enclosed-documents list derived from the claim's actual files, what is requested (settlement of the attached invoice/appraisal), contact details. No LLM.
- `compose.ts` — assembles `{ recipient, cc, subject, body, attachments[] }` from claim + checklist + `generated_forms` + directory; attachments are the existing signed-URL downloads (the filled accident-notice form + every checklist-relevant uploaded doc, each with its Hebrew label). No zip/merge in this phase — the פקידה attaches files one by one; a merged-packet builder is a later nicety. *(my call)*
- The screen renders in the cockpit as a new collapsible panel on the **עבודה על התיק** tab, surfaced by the header's next-action when the claim is submittable *(my call — it is where the checklist and tasks already live; a fifth tab would dilute the four-tab model)*. Copy buttons per field (clipboard API with select-fallback). The confirm button "סומן כנשלח — {insurer}" requires the recipient to be non-empty, then: ticks the track's `submitted_to_*` milestone via the existing checklist PATCH semantics, sets `handling_status='sent'`, and logs a `claim_events` row `submission_confirmed` carrying the exact recipient + subject shown.

### 4. UI surfaces, grouped not multiplied

- **Cockpit header**: the status badge shows the handling status (Hebrew label + days in status) once `handling_status` is set; next-action precedence gains two entries — "להכין שליחה למבטחת" when submittable-and-unsent, and "לעדכן סטטוס מול המבטחת" when `sent`/`docs_requested` is older than the follow-up due. Transitions happen in a small status dialog from the header (upload evidence → pick the destination status).
- **Dashboard card**: one line, from `dashboard/copy.ts`: e.g. "נשלחה להפניקס · ממתינים 12 ימים", "ממתין לתשלום", "נדחתה — לטפל בערעור". The archive table gains a handling-status column. No new sections, no new tabs.
- Tasks: no new rule table entries in this phase — `submit_to_tp_insurer` / `follow_up_*` already model the work; the only engine-visible change is that milestones now get ticked by the submission confirm + handling route instead of by hand. *(my call: a later phase can spawn `handle_docs_requested` from the `docs_requested` transition; out for now to keep the engine diff zero.)*

### 5. Migration `011_claim_handling.sql`

Additive: the two `doc_type` values, `claims.handling_status` + CHECK + `handling_status_changed_at`, and the `schema_migrations` row. Also folded into `web/db/schema.sql` (snapshot convention). RLS untouched — the new column rides the existing `claims` policies. Flag loudly in the PR + handoff: **must be pasted into dev and prod by hand** (`migration-guard` will enforce the label).

## What's left to the builder

- Exact file/module layout inside `web/src/lib/submission/` and the pure-table shape for transition legality (+ its Vitest coverage: legality matrix, evidence gates, note/lawyer requirements, milestone side-effects).
- The status-dialog UX details (upload-then-transition in one dialog; error states when the evidence upload fails mid-way).
- Where `handling_status` reads join the dashboard composition (`compose.ts` inputs) without an extra query per claim.
- Subject/body final Hebrew phrasing — draft freely, the user reviews copy in the PR.
- Whether `submission_confirmed` reuses `outbound_events` or only `claim_events` — builder picks after reading `008`'s constraints (`outbound_events.task_key` is rule-keyed; if it doesn't fit cleanly, `claim_events` alone is fine).

## Acceptance

- A `third_party_report` claim with a complete file can be walked: prepare screen shows real recipient/subject/body/attachments → confirm → milestone ticked, `follow_up_tp_insurer` spawned, card reads "נשלחה" → mark `docs_requested` with a note → back to `sent` → upload `payment_notice`, mark `paid` → `payment_received` milestone ticked, follow-up task completes.
- Attempting `paid` without a payment notice, or `rejected` without a rejection letter, is refused server-side with a Hebrew error naming the missing evidence.
- `own_policy` works through the same flow with its `submitted_to_insurer` milestone.
- `tsc`, `npm run build`, and all Vitest suites green; migration `011` applied to dev; prod application called out in the PR.
