# Generic demand form (טופס דרישה) — generated from the claim

**Date:** 2026-11-10 · **Status:** draft, awaiting approval
**Informed by:** a real insurer-issued form (ליברה, "טופס הפניה – דרישה בשם בניהול מוסך") the user shared on 2026-11-10. The image is **not** in the repo — it carries client PII.

## Intent

On the `third_party_report` track ("צד ג' שלא בהסדר") the checklist demands a `demand_form` before the claim can be submitted. Today that item is a manual upload that blocks submission, and nothing in the system can produce it, so the פקידה has to write it elsewhere.

Some insurers issue this form themselves. In the sample, ליברה — the **client's own** insurer — refers its comprehensive-policy holder to the garage, and the garage pursues the third party's insurer (מגדל) in the client's name instead of the client activating their own policy. Not every insurer does this, so the user decided (2026-11-10) to **generate one generic form for every insurer**, carrying the same kind of details as the ליברה form.

**Who to whom (user's decision):** the business handling the claim — a garage **or** an insurance agent, i.e. the `agents` row (see the CLAUDE.md trap: `agents` ≠ "insurance agent") — addresses the **third party's insurer**, demanding on behalf of the insured.

Why now: the demand form is the only blocking item on this track that the system can neither produce nor chase, so every `third_party_report` claim stalls on it.

## Goals

- From a `third_party_report` claim, the agent gets a one-page Hebrew PDF demand form, filled from data the claim already holds, with no retyping.
- Generating it satisfies the checklist's `demand_form` item, so the claim can become submittable without a manual upload.
- It is attached to the insurer submission email automatically, like the accident-notice form.
- The agent can fill in the fields the claim doesn't hold, then regenerate. Regenerating replaces the previous copy.
- If an insurer issued its own form (e.g. ליברה), the agent can still upload it as today, and the uploaded one wins.

## Content

Section order follows the ליברה sample. Field sources are the canonical `ClaimData` (`web/src/lib/formfill/types.ts`), read through `effectiveClaimData` so agent edits in `summary_json.form_data` win over the client's `collected` answers.

| Section | Field | Source |
|---|---|---|
| Header | Date | generation date, dd/mm/yyyy |
| Header | Sender | the handling business's details (see Decision 7) |
| Header | לכבוד | the third party's insurer (see Decision 8) |
| Title | "דרישה בשם המבוטח" + our plate, event date, the insurer's claim number | plate + date from `ClaimData`; claim number is **new** (below) |
| Vehicle | Make and model, year, model code | `vehicle.manufacturer` (the wizard and the registry store make + model together there; `vehicle.model` is never set), `vehicle.year`; model code is **new**, optional |
| Policy | Policy number, insurance type | `policy_number`, `insurance_type` (Hebrew label) |
| Insured | Name, phone | insured name, `insured.mobile` |
| Event | Insured's version | `accident.description` only. It already ends with the damage-focus text (`claim-state.ts` builds `description \| damageText`), so the damage focus is not printed separately. |
| Third parties | Name, ID, phone, plate, insurer — one row per vehicle | `third_parties[]` (multi-vehicle, PR #91) |
| Other | Police involvement (כן/לא) | `accident.police.notified` |
| Other | Date the car reached the garage | the `car_at_garage` milestone timestamp (PR #80) |
| Other | Appraiser | the existing `assessor_name` (already drawn by 8 accident-notice templates, so one edit fills both forms) |

**Fields the agent fills in.** Two fields are **new**, held in `summary_json.form_data` with no migration: the insurer's claim number and the model code. The registry lookup does not keep the model code (`VehicleInfo` has only `description` and `year`, and the result is not stored), so the model code is typed by hand.

Several existing fields are never collected by the wizard and have no input in `FormFieldEditor` today: `assessor_name`, `policy_number`, `insurance_type`, `accident.police.notified`, and a third party's `id_number`. The editor gains inputs for all of them, plus the two new fields. `police.notified` needs a כן / לא / לא ידוע control, because the editor's `setPath` writes strings only. *(My call: otherwise most of the form ships permanently blank, and the same fields improve the accident notice.)*

**Not included:**
- Any amount. The sample has none, and amounts only exist after the repair.
- The ליברה "הנחיות" block (post-dated cheques, 90 days, reporting to the insurer). Those are that insurer's terms toward the garage, not part of a demand.
- Any insurer's logo or branding. The document is the handling business's own.

Empty fields print as an empty line, not "לא ידוע", so the agent can see what is missing.

## Decisions (settled)

### 1. Drawn from scratch, not overlaid on a template

There is no blank source PDF: the document is ours. Render it with pdf-lib + fontkit and the existing Hebrew font asset (`app-hebrew.ttf`), reusing the formfill engine's right-anchored RTL text drawing. **Draw Hebrew in logical order, never reverse strings** (CLAUDE.md trap). One layout for every insurer.

### 2. Stored in `generated_forms` with `kind = 'demand_form'` — and every reader filters by kind

`generated_forms.kind` is free text, so no migration is needed. Regenerating replaces the prior row and its Storage object, as `persistForm` does for the accident notice.

**The trap this creates:** every current reader treats *any* `generated_forms` row as "the accident notice exists" — `hasGeneratedForm` in `outbound/load.ts`, `brief/brief.ts`, `tasks/runner.ts`, the cockpit page (including its form list and `hasStoredForm`), and `composeSubmission`, which takes `forms[0]` as the accident notice. Without a kind filter, a demand form would tick the accident-form checklist item and could be attached under the wrong label. **Every existing reader must filter on `kind = 'accident_notice'`.** *(My call: a separate table would avoid the trap but adds a migration and duplicates the persistence code.)*

### 3. How the checklist item is satisfied

`demand_form` stays a `kind: "doc"` item with `docType: "demand_form"`, `clientSuppliable: false`, and stays blocking. It counts as done when **either** a `demand_form` document was uploaded **or** a generated `demand_form` exists. `computeChecklist` needs that second input; the exact shape is left to the builder. *(My call: blocking stays, because the user's process lists the demand form among the documents sent to the insurer.)*

### 4. Attachments: uploaded beats generated

`composeSubmission` attaches the uploaded `demand_form` documents when any exist (the insurer's own form), and otherwise the latest generated one, labelled "טופס דרישה". Never both. *(My call.)*

### 5. When it is generated

- **Automatically**, best-effort, when the agent confirms the track as `third_party_report` (`PATCH /api/claims/[id]/classify`), in the background the way analysis is warmed. A failure never fails the classify call.
- **On demand** from the cockpit, with a "צור טופס דרישה" / regenerate button next to the accident-notice form on the **טופס ההודעה** tab, after the agent fills the missing fields.

The tab name stays as is for now. *(My call: renaming the tab touches copy and tests for no user gain yet.)*

### 7. Sender details

In prod, `agents.name` is null for the pilot garage, so reading the header straight from `agents` would print a blank sender. The user confirmed (2026-11-11) that the garage works with **one shared login**, so its `agents` row effectively is the business.

- **A one-time "פרטי העסק" form** in the dashboard lets the business fill in its name, phone and email. They are written to the existing `agents.name` / `agents.phone` / `agents.email` columns, so there is no migration.
- `agents` has a read-own-row RLS policy but **no update policy**. Write through an authenticated route that resolves the caller's own row and updates it with the service-role client, the same pattern the other agent routes use. Never let the client choose which row to update.
- **Until the details are filled in,** the cockpit's demand-form section says so and links to the form. The PDF is still generated, with a blank sender, so the claim is not blocked on it.
- **Known limit:** if a business moves to one login per employee, these details become per-person. Revisit then, probably via the existing `agencies` table.

### 8. Addressee: one form per claim

`claims.at_fault_insurer` is empty when the track is confirmed: its only writer is the submission-confirm step (`submission/confirm.ts`). So resolve the addressee in this order:
1. `claims.at_fault_insurer`, when set.
2. Otherwise, the third parties' insurers, if they all resolve (exact `matchInsurer`) to **one** canonical insurer.
3. Otherwise, leave "לכבוד" blank. The agent picks the insurer in the cockpit, the choice is persisted to `claims.at_fault_insurer` (the submission panel's insurer select already does this), and the agent regenerates.

One demand form per claim, keyed by `(claim, kind)`. *(My call: with several vehicles there is no per-vehicle fault data, so guessing which insurer to demand from is exactly the wrong-insurer risk; the agent decides.)*

### 6. Scope: `third_party_report` only

`third_party_settlement` and `own_policy` have no `demand_form` checklist item, and the user's process was described for the non-settlement track. Neither the button nor the automatic generation appears elsewhere.

## Non-goals

- Amounts, totals, or any money section.
- Extracting data from an insurer-issued form (AI/OCR). It is a natural next step, but separate.
- Sending the form or the email. That is part 3 (sending from the app), which waits on the pilot.
- Business letterhead beyond name/phone/email: no logo upload, address or business number (none are stored today).
- Per-insurer variants.
- A signature.

## Anti-goals

- **Impersonating an insurer.** The output must never look like it came from ליברה or any other insurer: no insurer logo, layout copy, or "מוקד שירות ותביעות" wording.
- **A demand to the wrong insurer.** If `at_fault_insurer` doesn't resolve to a canonical insurer, the "לכבוד" line is left blank for the agent, not guessed. The `matchInsurer` rule already applies: exact match only, no fuzzy matching.
- **PII leaking into logs or filenames.** Storage paths use the claim id and a timestamp only, never names, ID numbers or plates.

## Constraints

- **No migration.** Confirm `generated_forms.kind` has no CHECK constraint in prod before relying on that; if one exists, this becomes a hand-applied migration and must be called out loudly (CLAUDE.md, `docs/status.md` checklist).
- Hebrew UI strings in a `copy.ts`-style module; English identifiers.
- Next.js 16: read `web/node_modules/next/dist/docs/` before touching routes.
- Worktree branch off `origin/main`, PR, no self-merge.
- Done means `tsc`, `npm run build` and Vitest green.

## What's left to the builder

- The module layout. Suggested: a pure `buildDemandData(claim, agent, now)` returning display rows, plus a `renderDemandPdf(rows)` doing I/O, mirroring `formfill/`.
- Page layout and Hebrew copy. The user reviews the rendered PDF in the PR, so attach one rendered from `sample-claim.ts`.
- The shape of the new `computeChecklist` input.
- Whether the cockpit regenerate goes through a new route (`POST /api/claims/[id]/demand-form`) or extends the existing form route.
- Wrapping long text (the insured's version) — the engine's `maxLines` wrapping is a reference.

## Acceptance

- Confirming a claim as `third_party_report` produces a demand form in the case file. The checklist's מכתב דרישה item ticks, and the accident-form item is unaffected.
- A claim with only a generated demand form and no accident notice still shows the accident-form item as missing.
- Uploading an insurer's own demand form makes the submission attach that one instead of the generated one.
- Regenerating after editing the appraiser name replaces the previous PDF; it doesn't add a second.
- An unresolved third-party insurer leaves "לכבוד" blank.
- Unit tests cover `buildDemandData` (sources, blanks, multiple third parties), the kind filtering in each reader, the checklist done-rule, and attachment precedence.
- `tsc`, `npm run build` and Vitest green.
