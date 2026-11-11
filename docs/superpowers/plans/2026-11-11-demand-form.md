# Generic Demand Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a one-page Hebrew demand form (טופס דרישה) from a `third_party_report` claim. It satisfies the checklist's `demand_form` item and is attached to the insurer submission.

**Architecture:**
- A pure builder (`lib/demand/data.ts`) turns the claim into display rows.
- A renderer (`lib/demand/render.ts`) draws them with pdf-lib, reusing the formfill engine's RTL drawing.
- A persistence function stores the PDF in `generated_forms` with `kind = 'demand_form'`.
- Every existing `generated_forms` reader becomes kind-aware, so a demand form never counts as the accident notice.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + Storage), pdf-lib + @pdf-lib/fontkit, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-demand-form-design.md`. Read it first: the decisions there are not repeated here.

## Global Constraints

- **No migration.** `generated_forms.kind` is free text; `agents.name/phone/email` already exist. Before merging, confirm in the prod SQL editor that `generated_forms.kind` has no CHECK constraint. If it does, stop and flag it.
- **Hebrew in logical order, never reversed.** pdf-lib + fontkit shape RTL themselves.
- Hebrew UI strings live in a `copy.ts` module. Identifiers are English.
- Next.js 16: read `web/node_modules/next/dist/docs/` before writing routes or using `after()`.
- Storage paths: `${claimId}/forms/demand-${Date.now()}.pdf`, never names, IDs or plates.
- Scope: `third_party_report` only. No button, no automatic generation, on other tracks.
- Done means `npx tsc --noEmit`, `npm run build` and `npx vitest run` all green. The build needs the worktree's own `npm ci`, because a junctioned `node_modules` breaks Turbopack.
- Worktree branch off `origin/main`; one PR; no self-merge.

## Review Focus

1. **A claim with a generated demand form but no accident notice.** The accident-form checklist item must stay undone, and the submission must not label the demand form "טופס הודעה על תאונה". Covered by Task 1 tests.
2. **Two third-party vehicles with different insurers.** "לכבוד" is blank, never the first insurer. Covered by Task 3 `resolveAddressee` tests.
3. **The agent uploaded the insurer's own form and a generated one also exists.** Only the uploaded one is attached. Covered by Task 2.
4. **A near-empty claim:** no ClaimData, no sender details, no third parties. The PDF still renders, with blank lines rather than "undefined". Covered by Task 3 (data) and Task 4 (render).
5. **Regenerating twice.** Exactly one `demand_form` row remains, and the old Storage object is removed. This is I/O, so verify it manually in Task 6, step 5.

---

### Task 1: Kind-aware generated-forms readers

**Files:**
- Create: `web/src/lib/forms/kinds.ts`, `web/src/lib/forms/kinds.test.ts`
- Modify:
  - `web/src/lib/outbound/load.ts:49`
  - `web/src/lib/brief/brief.ts:105,120,154`
  - `web/src/lib/tasks/runner.ts:39-41,51`
  - `web/src/app/dashboard/[id]/page.tsx:139-142,226-260,338,369,580-600,619`

**Interfaces:**
- Produces:
  - `export const FORM_KIND = { accidentNotice: "accident_notice", demand: "demand_form" } as const`
  - `export function formFacts(kinds: Iterable<string>): { hasAccidentNotice: boolean; generatedDocTypes: string[] }`. `generatedDocTypes` is `["demand_form"]` when a demand form exists, otherwise `[]`.

**Steps:**
- [ ] **Step 1: Write the failing tests** in `kinds.test.ts`.
  - `formFacts(["demand_form"])` → `{ hasAccidentNotice: false, generatedDocTypes: ["demand_form"] }`.
  - `formFacts(["accident_notice"])` → `{ hasAccidentNotice: true, generatedDocTypes: [] }`.
  - `formFacts([])` → both empty or false.
  - Add a `computeChecklist` case in `web/src/lib/claims/checklist.test.ts`: pass `hasGeneratedForm = false` and an uploaded set containing `"demand_form"` (as callers will, from `generatedDocTypes`). Expect `accident_form.done === false` and `demand_form.done === true`.
- [ ] **Step 2: Run `npx vitest run src/lib/forms` and check it fails.** Expected: module not found.
- [ ] **Step 3: Implement `formFacts`.**
- [ ] **Step 4: Update each reader.**
  - Select `kind` alongside the existing columns.
  - Pass `hasAccidentNotice` as `computeChecklist`'s `hasGeneratedForm`.
  - Union `generatedDocTypes` into the set passed as `uploadedDocTypes`.
  - In `runner.ts`, replace the head-count query with a `select("kind")`.
  - In `page.tsx`:
    - the form list, `hasStoredForm` and `composeSubmission`'s `forms` use accident-notice rows only;
    - keep the demand rows in a separate `demandForms` array for Task 7.
- [ ] **Step 5: Run `npx tsc --noEmit` and `npx vitest run` and check both pass.**
- [ ] **Step 6: Commit** with message `refactor(forms): readers distinguish accident notice from demand form`.

### Task 2: Submission attaches the demand form

**Files:**
- Modify: `web/src/lib/submission/compose.ts`
- Test: `web/src/lib/submission/submission.test.ts`

**Interfaces:**
- Consumes: Task 1's `demandForms` rows from the cockpit page.
- Produces: `composeSubmission` input gains `demandForms: { storage_path: string }[]`, newest first. The page passes it. No other caller exists.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - `"a generated demand form is attached when none was uploaded"`. Input: checklist with `demand_form` done, `docs` empty, `demandForms: [{ storage_path: "c/1/demand.pdf" }]`. Expect the attachments to contain `{ label: "טופס דרישה", storagePath: "c/1/demand.pdf" }`.
  - `"an uploaded demand form wins over a generated one"`. Input: `docs` has a `demand_form` row at `c/1/libra.pdf`, and `demandForms` is non-empty. Expect the attachments to contain `c/1/libra.pdf` and not `c/1/demand.pdf`.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement.** After the doc loop, if no attachment came from `docType === "demand_form"`, push the first `demandForms` entry with the label `"טופס דרישה"`.
- [ ] **Step 4: Run `npx vitest run src/lib/submission` and check it passes.**
- [ ] **Step 5: Commit** with message `feat(submission): attach the demand form, preferring an uploaded one`.

### Task 3: Demand data builder

**Files:**
- Create: `web/src/lib/demand/data.ts`, `web/src/lib/demand/data.test.ts`, `web/src/lib/demand/copy.ts`
- Modify: `web/src/lib/formfill/types.ts` (add `tp_claim_number?: string` at the `ClaimData` top level, and `model_code?: string` to `vehicle`)

**Interfaces:**
- Produces:
  - `export type DemandRow = { label: string; value: string }`
  - `export type DemandSection = { heading: string; rows: DemandRow[] }`
  - `export type DemandDoc = { date: string; sender: { name: string; phone: string; email: string }; addressee: string; title: string; subtitle: DemandRow[]; sections: DemandSection[] }`
  - `export function resolveAddressee(atFaultInsurer: string | null, tpInsurers: (string | null)[]): string | null`. Returns a canonical key, using exact `matchInsurer` matching.
  - `export function buildDemandData(input: { data: ClaimData | null; sender: { name: string | null; phone: string | null; email: string | null }; addresseeKey: string | null; carAtGarageAt: string | null; now: Date }): DemandDoc`

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - `resolveAddressee("migdal", [])` → `"migdal"`.
  - `resolveAddressee(null, ["מגדל", "מגדל"])` → `"migdal"`.
  - `resolveAddressee(null, ["מגדל", "הראל"])` → `null`.
  - `resolveAddressee(null, ["לא ידוע"])` → `null`.
  - `resolveAddressee(null, [])` → `null`.
  - `buildDemandData` with `sampleClaim` (`web/src/lib/formfill/sample-claim.ts`), `addresseeKey: "migdal"` and `now = 2026-11-11`:
    - `date === "11/11/2026"`, and `addressee` is the Hebrew label `"מגדל"`;
    - the vehicle row reads `data.vehicle.manufacturer`;
    - the insured phone reads `insured.mobile`;
    - the "event" section has a single row from `accident.description`, with no separate damage-focus row;
    - there is one third-party row group per `third_parties` entry;
    - police reads `כן`/`לא` from `accident.police.notified`, and an empty string when undefined;
    - `assessor_name` appears under the appraiser label.
  - `buildDemandData({ data: null, sender: { name: null, phone: null, email: null }, addresseeKey: null, … })` has no value equal to `"undefined"` or `"null"`; every value is a string.
- [ ] **Step 2: Run `npx vitest run src/lib/demand` and check it fails.**
- [ ] **Step 3: Implement.**
  - Labels and the title go in `copy.ts`, following the spec's content table and section order.
  - The insurance-type label comes from `LABELS` in `web/src/lib/formfill/labels.ts`.
  - Format dates with `toILDate` (`web/src/lib/dates.ts`).
  - The car-at-garage date comes from `carAtGarageAt`.
- [ ] **Step 4: Run the tests and check they pass.**
- [ ] **Step 5: Commit** with message `feat(demand): pure demand-form data builder`.

### Task 4: PDF renderer + sample script

**Files:**
- Create: `web/src/lib/demand/render.ts`, `web/src/lib/demand/render.test.ts`, `web/scripts/demand.ts`
- Modify: `web/src/lib/formfill/engine.ts:77` (export `drawRightAnchored`; no behaviour change)

**Interfaces:**
- Consumes: `DemandDoc` (Task 3).
- Produces: `export async function renderDemandPdf(doc: DemandDoc): Promise<Uint8Array>`, an A4 single page with the Hebrew font `app-hebrew.ttf` from the formfill `assets` directory.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - `"renders a one-page PDF"`: load the output with `PDFDocument.load`, then `getPageCount() === 1` and the bytes start with `%PDF`.
  - `"renders an empty doc without throwing"`, using Task 3's all-null output.
  - `"wraps a 600-character description without throwing"`.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement.**
  - Lay out with right-anchored rows and `drawRightAnchored`.
  - Wrap long values on spaces at a fixed width, the same approach as `fillForm`'s `maxLines` wrapping. If text still overflows, shrink the font to a floor of 8pt and then truncate with "…".
  - Show the sender block at the top, then the date, "לכבוד", the title, and the sections. No logo, and no insurer branding.
- [ ] **Step 4: Run the tests and check they pass.**
- [ ] **Step 5: Add `web/scripts/demand.ts`.** It renders `buildDemandData(sampleClaim, …)` to `web/.pdfwork-out/demand-sample.pdf`, following `scripts/fill.ts`. Run it with `npx tsx scripts/demand.ts`, open the PDF, and check the Hebrew reads right-to-left.
- [ ] **Step 6: Commit** with message `feat(demand): render the demand form PDF`.

### Task 5: Business details (sender)

**Files:**
- Create:
  - `web/src/lib/validation/phone.ts` (moved from `FormFieldEditor.tsx`)
  - `web/src/lib/agents/details.ts`, `web/src/lib/agents/details.test.ts`
  - `web/src/app/api/agents/me/route.ts`
  - `web/src/app/dashboard/BusinessDetails.tsx`
- Modify: `web/src/app/dashboard/page.tsx` (render the form), `web/src/lib/dashboard/copy.ts`

**Interfaces:**
- Produces:
  - `export function parseBusinessDetails(body: unknown): { ok: true; value: { name: string; phone: string | null; email: string | null } } | { ok: false; error: string }`. The name is required after trimming, at most 80 characters. The phone uses `validatePhone`, which today is a local function in `FormFieldEditor.tsx:62`. Move it to `web/src/lib/validation/phone.ts` and import it in both places, without changing its behaviour. The email check is minimal (`x@y.z`). Errors are in Hebrew.
  - `PATCH /api/agents/me`. It authenticates the user, resolves the agent row by `auth_user_id = user.id`, and updates `name/phone/email` with the service-role client. It never accepts a row id from the client.
  - `GET` on the same route returns the caller's row.

**Steps:**
- [ ] **Step 1: Write the failing tests** for `parseBusinessDetails`.
  - A valid input is trimmed.
  - A missing name is rejected.
  - An 81-character name is rejected.
  - A bad phone is rejected.
  - An empty phone or email becomes `null`.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement the parser and the route.**
- [ ] **Step 4: Build the form.**
  - On the dashboard index, show a collapsible "פרטי העסק" block. It opens automatically while `agents.name` is null.
  - After saving, call `router.refresh()`.
- [ ] **Step 5: Run `npx tsc --noEmit` and `npx vitest run src/lib/agents` and check both pass.**
- [ ] **Step 6: Commit** with message `feat(agents): business details used as the demand-form sender`.

### Task 6: Generate, persist, and trigger

**Files:**
- Create: `web/src/lib/demand/generate.ts`, `web/src/app/api/claims/[id]/demand-form/route.ts`
- Modify: `web/src/app/api/claims/[id]/classify/route.ts`

**Interfaces:**
- Consumes: Task 3 (`resolveAddressee`, `buildDemandData`), Task 4 (`renderDemandPdf`), `effectiveClaimData`, and `milestoneDates` (`web/src/lib/claims/milestone-dates.ts`, from `claim_events`).
- Produces:
  - `export async function generateDemandForm(claimId: string): Promise<{ ok: true; storagePath: string } | { ok: false; reason: "not_third_party_report" | "not_found" | "error" }>`. It runs with the service role. It only runs for `claim_type = "third_party_report"`.
  - It deletes prior `kind = "demand_form"` rows and their Storage objects, then uploads the new PDF and inserts a row.
  - After a successful insert it calls `runEngine(claimId, { type: "doc_uploaded", docType: "demand_form" })`, so `submit_to_tp_insurer` can spawn.
  - `POST /api/claims/[id]/demand-form` takes the body `{ at_fault_insurer?: string }`.
    - It authenticates and checks ownership with an RLS-scoped select, the pattern the other `[id]` routes use.
    - When `at_fault_insurer` is a key in `INSURER_DIRECTORY`, it writes `claims.at_fault_insurer`. An unknown key returns 400.
    - It then calls `generateDemandForm` and returns `{ ok }`, or 500 through `serverError`.

**Steps:**
- [ ] **Step 1: Implement `generateDemandForm`.**
  - Read the claim, the agent row (sender), `third_parties.insurer`, and the `claim_events` milestones.
  - The addressee is `resolveAddressee(claims.at_fault_insurer, tpInsurers)`.
- [ ] **Step 2: Add the route.**
- [ ] **Step 3: Wire automatic generation.** In the classify route, when the confirmed type is `third_party_report`, schedule `generateDemandForm(id)` with `after()` from `next/server`. Wrap it in a try/catch that reports through `serverError` without failing the response, the way `submit/route.ts` warms analysis.
- [ ] **Step 4: Run `npx tsc --noEmit` and check it passes.**
- [ ] **Step 5: Check it by hand against the dev DB.**
  - Confirm a test claim as `third_party_report`. One `generated_forms` row with `kind = demand_form` appears, and the checklist's מכתב דרישה item is done.
  - POST to the route twice. Exactly one row remains, and the old Storage object is gone.
- [ ] **Step 6: Commit** with message `feat(demand): generate on track confirm and on demand`.

### Task 7: Cockpit section + editor fields

**Files:**
- Create: `web/src/app/dashboard/[id]/DemandFormPanel.tsx`
- Modify:
  - `web/src/app/dashboard/[id]/page.tsx` (render it on the `form` tab, `third_party_report` only)
  - `web/src/app/dashboard/[id]/FormFieldEditor.tsx:83-149`
  - `web/src/lib/cockpit/copy.ts`

**Interfaces:**
- Consumes:
  - Task 1's `demandForms`, with signed URLs built the way the page builds them for forms;
  - Task 6's route;
  - `agentRow.name` to decide on the missing-sender notice;
  - `resolveAddressee` to decide whether to show the insurer select.

**Steps:**
- [ ] **Step 1: Build `DemandFormPanel`.**
  - Show the latest demand form (open/download link) and a "צור טופס דרישה" / "צור מחדש" button that POSTs to the route and then calls `router.refresh()`.
  - Show the notice "פרטי העסק חסרים — הטופס ייצא בלי שולח" with a link to `/dashboard`, while the sender name is empty.
  - When the addressee resolves to `null`, show an insurer `<select>` built from `INSURER_DIRECTORY`. Its value is sent as `at_fault_insurer`.
- [ ] **Step 2: Add the editor fields.**
  - Section "פוליסה": `policy_number` ("מספר פוליסה") and `insurance_type` as a select (מקיף / חובה / צד ג').
  - Under "תאונה": `accident.police.notified` as a כן / לא / לא ידוע select. It writes `true`, `false` or deletes the key; extend `setPath` to accept booleans.
  - New section "תביעה": `assessor_name` ("שמאי") and `tp_claim_number` ("מספר תביעה אצל המבטחת").
  - Vehicle: `vehicle.model_code` ("קוד דגם").
  - Per third party: `${p}.id_number` ("תעודת זהות", `validateIdNumber`).
- [ ] **Step 3: Run `npx tsc --noEmit`, `npm run build` and `npx vitest run`, and check all pass.**
- [ ] **Step 4: Verify in the browser.**
  - Run the production build on :3101 (see the memory note on worktree dev servers).
  - On a dev `third_party_report` claim: fill the appraiser, regenerate, open the PDF and check the appraiser appears.
  - Pick an insurer on a two-insurer claim and check "לכבוד" is filled.
  - Take a screenshot for the PR.
- [ ] **Step 5: Commit** with message `feat(cockpit): demand form panel and the fields it needs`.

### Task 8: Docs + PR

**Files:**
- Modify: `docs/claim-management.md` (§2 generated outputs: `demand_letter` → built as `generated_forms.kind = 'demand_form'`; §3 `third_party_report`), `docs/app-map.md` (`lib/demand/`, `lib/forms/kinds.ts`, the new routes)

**Steps:**
- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Open the PR.** Attach the sample PDF rendered from `sampleClaim` (not real PII) and the screenshot.
  - State **"no migration"** and the pending prod check on `generated_forms.kind`.
  - Ask the user to fill in "פרטי העסק" in prod after the deploy.
