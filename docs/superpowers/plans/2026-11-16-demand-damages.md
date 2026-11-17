# Demand Form Damages Section (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The פקידה types damage amounts on a `third_party_report` claim, and the generated demand form prints them as a "פירוט הנזק" section with VAT and a total.

**Architecture:**
- **Pure module.** `lib/demand/damages.ts` owns the money rules: types, VAT, totals in integer agorot, parsing and validation.
- **Persistence.** Amounts are stored in `summary_json.form_data.damages`.
- **Regeneration.** The form-data route validates them and regenerates the demand form after each save.
- **Checklist.** The readers count a generated demand form only once a repair amount exists.
- **Renderer.** It gains a second page instead of dropping rows.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase, pdf-lib + @pdf-lib/fontkit, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-demand-damages-design.md` (PR #118). Read it first; its decisions are not repeated here. It builds on the demand form from PR #106, which is merged into `main`.

## Global Constraints

- **No migration.** `damages` lives in `summary_json.form_data`.
- **VAT rate:** the constant `VAT_RATE = 0.18`, in force since 2025-01-01. It is not stored per claim.
- **Amounts are stored before VAT.** Each line carries `vat: boolean`.
  - Defaults: `true` for repair, assessor fee and towing; `false` for diminished value and "other" lines.
  - A missing `vat` on an "other" line reads as `false`.
- **Limits:** amount is finite, `0 ≤ amount ≤ 1_000_000`, with at most 2 decimals. An "other" label is non-empty after trimming, at most 60 characters. At most 10 "other" lines.
- **Money is computed in integer agorot.** VAT is rounded half-up, once, on the sum of the VAT-able lines.
- **Money rows on the PDF are never truncated, never clipped, and never dropped below the margin.**
- Hebrew is drawn in logical order and never reversed. Hebrew UI strings go in `copy.ts` modules; identifiers are English.
- Next.js 16: read `web/node_modules/next/dist/docs/` before touching routes or `after()`.
- Work in a worktree branch off `origin/main` (`feat/demand-damages`). Run `npm ci` in the worktree's `web/`: a junctioned `node_modules` breaks Turbopack. One PR, no self-merge.
- Done means `npx tsc --noEmit`, `npm run build` and `npx vitest run` are all green, with output pasted.

## Review Focus

1. **A crowded claim:** three third parties and ten "other" lines, enough to fill the page at the 8pt floor. Today the draw guard silently drops whatever falls below the margin, which would include the money rows. Expect a second page, with every amount drawn. *(Task 6 test.)*
2. **Floating-point money:** many "other" lines such as 0.10 + 0.20, plus a VAT half-agora. Expect exact agorot: 0.10 + 0.20 = 0.30, and VAT on 0.25 = 0.05 by half-up. *(Task 1 tests.)*
3. **The way people type amounts:** "7,370", "7370.5", " 800 ", "₪800", "1.234", "abc", "". Strip thousands commas, spaces and "₪". Reject anything else with a Hebrew error. An empty field deletes the line. *(Task 1 `parseAmountInput` tests.)*
4. **Legacy or malformed stored data:** `damages` absent, a string amount, `NaN`, or `other` that is not an array. `computeDamageTotals` ignores bad entries and never throws; the route rejects them on save. *(Task 1 tests.)*
5. **Two saves in quick succession:** the overlapping regenerations must leave exactly one `demand_form` row. *(Task 3 test of the pure selector, plus a manual check on dev.)*

---

### Task 1: Damages module (pure)

**Files:**
- Create: `web/src/lib/demand/damages.ts`, `web/src/lib/demand/damages.test.ts`
- Modify: `web/src/lib/formfill/types.ts` (add `damages?: Damages` to `ClaimData`, importing the type from `../demand/damages`, or defining it in `types.ts` and re-exporting it; pick whichever avoids a cycle)

**Interfaces — Produces:**
- `export const VAT_RATE = 0.18`
- `export type DamageLine = { amount: number; vat: boolean }`
- `export type OtherDamage = { label: string; amount: number; vat?: boolean }`
- `export type Damages = { repair?: DamageLine; diminished_value?: DamageLine; assessor_fee?: DamageLine; towing?: DamageLine; other?: OtherDamage[]; claimant_vat_registered?: boolean }`
- `export type DamageKey = "repair" | "diminished_value" | "assessor_fee" | "towing"`
- `export const DEFAULT_VAT: Record<DamageKey, boolean>`: repair `true`, diminished_value `false`, assessor_fee `true`, towing `true`.
- `export type DamageTotals = { rows: { key: DamageKey | "other"; label: string; amount: number }[]; vat: number | null; total: number }`. Amounts are in shekels, rounded to agorot. For fixed rows `label` is `""` (the caller supplies Hebrew labels by key); for "other" rows it is the stored label.
- `export function computeDamageTotals(d: Damages | undefined | null): DamageTotals | null`. Returns `null` when no valid line has an amount above 0. Row order: repair, diminished_value, assessor_fee, towing, then the other lines in their stored order. `vat` is `null` when `claimant_vat_registered` is true.
- `export function formatILS(amount: number): string` → `"7,370.00 ₪"`.
- `export function parseAmountInput(raw: string): { ok: true; value: number | null } | { ok: false; error: string }`. An empty value gives `null`.
- `export function validateDamages(v: unknown): { ok: true } | { ok: false; error: string }`. Absent or `undefined` is ok.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - Spec acceptance, VAT-registered off: `computeDamageTotals({ repair: { amount: 7370, vat: true }, assessor_fee: { amount: 677.97, vat: true } })` gives `rows` amounts `[7370, 677.97]`, `vat === 1448.63`, `total === 9496.6`.
  - The same with `claimant_vat_registered: true` gives `vat === null` and `total === 8047.97`.
  - Diminished value adds no VAT: `{ repair: {amount: 1000, vat: true}, diminished_value: {amount: 500, vat: false} }` gives `vat === 180` and `total === 1680`.
  - Agorot exactness: two other lines of 0.10 and 0.20, without VAT, give `total === 0.3`. One other line of 0.25 with VAT gives `vat === 0.05`.
  - Empty and malformed input gives `null`, and never throws, for each of: `undefined`, `{}`, `{ repair: { amount: 0, vat: true } }`, `{ repair: { amount: "7370" } }`, `{ repair: { amount: NaN, vat: true } }`, `{ other: "x" }`.
  - An "other" line without `vat` gets no VAT.
  - `formatILS(7370)` is `"7,370.00 ₪"`, `formatILS(0.3)` is `"0.30 ₪"`, and `formatILS(1000000)` is `"1,000,000.00 ₪"`. Format by hand, not with `toLocaleString`, so the output doesn't depend on the ICU build.
  - `parseAmountInput`:
    - `"7,370"` → 7370;
    - `" 800 "` → 800;
    - `"₪800"` → 800;
    - `"7370.5"` → 7370.5;
    - `""` → `null`;
    - each of `"abc"`, `"1.234"`, `"-5"`, `"1000001"` → `ok: false`.
  - `validateDamages`, rejecting each of:
    - a negative amount;
    - `NaN`;
    - `12.345`;
    - `1000001`;
    - an empty label;
    - a 61-character label;
    - 11 "other" lines;
    - `vat: "yes"`;
    - `claimant_vat_registered: "no"`;
    - `damages` as an array.

    It accepts `undefined` and the acceptance example.
- [ ] **Step 2: Run `npx vitest run src/lib/demand/damages` and check it fails** (module not found).
- [ ] **Step 3: Implement.** Convert each amount to agorot with `Math.round(amount * 100)`. Round VAT half-up: `Math.round(vatableAgorot * 18 / 100)`, in integer arithmetic. Derive the 18 from `VAT_RATE`, with a test pinning it.
- [ ] **Step 4: Run the tests and check they pass.** Then run `npx tsc --noEmit`.
- [ ] **Step 5: Commit** with message `feat(demand): damages money rules — totals, VAT, parsing, validation`.

### Task 2: Form-data route validates damages and regenerates

**Files:**
- Modify: `web/src/app/api/claims/[id]/form-data/route.ts`

**Interfaces — Consumes:** `validateDamages` (Task 1), `generateDemandForm(claimId)` (`lib/demand/generate.ts`), `after` from `next/server`, `serverError`.

**Steps:**
- [ ] **Step 1: Validate.** After the existing body check, run `validateDamages(formData.damages)`. On failure, return `400 { error }` and write nothing.
- [ ] **Step 2: Regenerate.**
  - Widen the RLS select to `"id, summary_json, claim_type"`.
  - After a successful update and the `form_data_edited` event, when `claim_type === "third_party_report"`, schedule `after(async () => { try { await generateDemandForm(id) } catch (e) { await serverError(...) } })`. Mirror how `classify/route.ts` does it, including its `serverError` call shape.
  - `generateDemandForm` never throws; keep the try/catch as defence.
- [ ] **Step 3: Run `npx tsc --noEmit` and check it passes.**
- [ ] **Step 4: Commit** with message `feat(demand): validate damages on save and regenerate the demand form`.

### Task 3: Regeneration converges to one row

**Files:**
- Modify: `web/src/lib/demand/generate.ts`
- Create: `web/src/lib/demand/cleanup.ts`, `web/src/lib/demand/cleanup.test.ts`

**Interfaces — Produces:** `export function staleDemandRows<T extends { id: string; created_at: string }>(rows: T[]): T[]`. It returns every row except the newest by `created_at`. Ties go to the larger `id`, so the choice is deterministic. An empty input gives `[]`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - Three rows give the two older ones.
  - One row gives `[]`.
  - Equal `created_at` keeps the larger id.
  - Unsorted input works.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it, then use it in `generate.ts`.**
  - After the insert, re-read every `demand_form` row of the claim, selecting `id, storage_path, created_at`.
  - Delete `staleDemandRows(rows)`: Storage objects first, then rows. This keeps today's best-effort error reporting.
  - The pre-insert `prior` read is no longer needed.
- [ ] **Step 4: Run `npx vitest run src/lib/demand` and `npx tsc --noEmit`, and check both pass.**
- [ ] **Step 5: Commit** with message `fix(demand): regeneration keeps only the newest demand form`.

### Task 4: Checklist counts a generated demand only once the repair is priced

**Files:**
- Modify:
  - `web/src/lib/forms/kinds.ts`
  - `web/src/lib/forms/kinds.test.ts`
  - `web/src/app/dashboard/[id]/page.tsx:214`
  - `web/src/lib/brief/brief.ts:126`
  - `web/src/lib/tasks/runner.ts:34,52`
  - `web/src/lib/outbound/load.ts:35,83`
- Test: `web/src/lib/claims/checklist.test.ts`

**Interfaces — Produces:**
- `formFacts(kinds: Iterable<string>, repairPriced: boolean)`, same return type. `generatedDocTypes` is `["demand_form"]` only when a demand row exists **and** `repairPriced` is true.
- `export function isRepairPriced(data: ClaimData | null): boolean`, in `kinds.ts` or `damages.ts`. It is true when `data?.damages?.repair?.amount` is a finite number above 0.

**Steps:**
- [ ] **Step 1: Update the tests.**
  - `formFacts(["demand_form"], false)` gives `generatedDocTypes: []`.
  - `formFacts(["demand_form"], true)` gives `["demand_form"]`.
  - `formFacts(["accident_notice"], true)` gives `hasAccidentNotice: true` and `[]`.
  - `isRepairPriced`:
    - `null` → false;
    - `{}` → false;
    - amount 0 → false;
    - amount `"7370"` (a string) → false;
    - amount 7370 → true.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it and update the four readers.**
  - Each reader computes `isRepairPriced(effectiveClaimData(summary_json))`.
  - Add `summary_json` to the claim selects in `runner.ts` and `outbound/load.ts`. `page.tsx` and `brief.ts` already select it.
  - Uploaded `demand_form` docs are unaffected, because they come from `claim_documents`, not `formFacts`.
- [ ] **Step 4: Run `npx tsc --noEmit` and `npx vitest run`, and check both pass.**
- [ ] **Step 5: Commit** with message `feat(checklist): a generated demand form counts once the repair is priced`.

### Task 5: Letter data — the "פירוט הנזק" section

**Files:**
- Modify:
  - `web/src/lib/demand/data.ts`
  - `web/src/lib/demand/copy.ts`
  - `web/src/lib/demand/data.test.ts`
  - `web/src/lib/formfill/sample-claim.ts` (add the acceptance damages so the sample PDF shows the section, and fix any existing test that pins the sample's section list)

**Interfaces:**
- Consumes: `computeDamageTotals` and `formatILS` (Task 1).
- Produces:
  - `DemandRow` gains an optional `kind?: "money" | "total"`. The renderer (Task 6) never caps, clips or drops these rows, and it emphasises `"total"`.
  - `DemandSection` gains an optional `money?: true`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - With the acceptance damages, the sections contain one with heading `"פירוט הנזק (כולל מע״מ)"`, placed after the last third-party section and before `"נוסף"`.
  - Its rows, as `[label, value]` pairs, are:
    - `["תיקון הרכב", "7,370.00 ₪"]`;
    - `["שכ״ט שמאי", "677.97 ₪"]`;
    - `["מע״מ (18%)", "1,448.63 ₪"]`;
    - `["סה״כ לדרישה", "9,496.60 ₪"]`, with `kind: "total"`.
  - The non-total rows have `kind: "money"`.
  - With `claimant_vat_registered: true`, the heading is `"פירוט הנזק (לפני מע״מ)"`, there is no VAT row, and the total is `"8,047.97 ₪"`.
  - An "other" line prints its own label.
  - With no damages there is no "פירוט הנזק" section, and the existing near-empty test still holds.
  - The other fixed labels are `"ירידת ערך"` and `"גרירה"`.
- [ ] **Step 2: Run `npx vitest run src/lib/demand/data` and check it fails.**
- [ ] **Step 3: Implement it.** Put all labels and the two heading variants in `copy.ts`, keyed by `DamageKey`. The section is omitted when `computeDamageTotals` returns `null`.
- [ ] **Step 4: Run the tests and check they pass.**
- [ ] **Step 5: Commit** with message `feat(demand): damages section in the demand form data`.

### Task 6: Renderer — money rows are never lost; second page

**Files:**
- Modify: `web/src/lib/demand/render.ts`, `web/src/lib/demand/render.test.ts`

**Interfaces:**
- Consumes: `DemandRow.kind` (Task 5).
- Produces: `DrawnText` gains `page: number` (0-based). `renderDemandPdf` may return 2 or more pages.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - `"a crowded claim flows to a second page and draws every amount"`:
    - Build a doc with 3 third-party sections, a 600-character description, and 10 "other" lines (via `buildDemandData`).
    - Expect `getPageCount() >= 2`.
    - Every `formatILS` value from that doc's money rows appears in `drawn`.
    - No drawn `y` is below `MARGIN`.
  - `"money rows are never capped"`: in the same crowded doc, no money-row text contains "…".
  - `"the acceptance doc stays on one page"`: the sample with damages gives `getPageCount() === 1`.
  - The existing tests still pass, and their single-page expectations still hold for the docs they use.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it.**
  - Keep the current order: shrink to the 8pt floor, then cap the longest non-money values.
  - Money and total rows are excluded from capping and from `clip`. They are short; if one is ever wider than the value column, it moves to its own line instead of being clipped.
  - When the height still exceeds one page, stop capping and paginate. Lay the items out top to bottom, starting a new page when the next item would cross `MARGIN`. A section heading moves to the next page together with its first row.
  - Draw the `"total"` row at scale 1.1 with a rule above it. The font asset has a single weight, so emphasis replaces bold. This is a deliberate deviation from the spec's "bold".
- [ ] **Step 4: Run `npx vitest run src/lib/demand` and check it passes.**
  - Run `npx tsx scripts/demand.ts` and open `web/.pdfwork-out/demand-sample.pdf`.
  - Check that "₪" and the digits read correctly in the RTL rows, e.g. "7,370.00 ₪" is not reordered (the bidi-digit lesson).
  - If they are reordered, fix it with the `visualRuns` helper in `formfill/bidi.ts`, which the engine's drawing uses. Never reverse strings by hand.
- [ ] **Step 5: Commit** with message `feat(demand): render damages; never drop money rows; second page`.

### Task 7: Cockpit — the damages editor

**Files:**
- Create: `web/src/app/dashboard/[id]/DamagesFields.tsx`
- Modify:
  - `web/src/app/dashboard/[id]/FormFieldEditor.tsx` (render `DamagesFields` when `claimType === "third_party_report"`, wired to the editor's `data` and `setData`)
  - `web/src/lib/cockpit/copy.ts`

**Interfaces — Consumes:** `Damages`, `DEFAULT_VAT`, `parseAmountInput`, `computeDamageTotals`, `formatILS` (Task 1). The save goes through the existing `FormFieldEditor` save. Nothing new on the server.

**Steps:**
- [ ] **Step 1: Build `DamagesFields`.** A fieldset titled "פירוט הנזק" with:
  - **Fixed lines:** four amount inputs (תיקון הרכב, ירידת ערך, שכ״ט שמאי, גרירה), with the hint "לפני מע״מ".
    - Typing goes through `parseAmountInput`, and the error shows inline.
    - A valid value writes `{ amount, vat: existing ?? DEFAULT_VAT[key] }`.
    - Clearing a field deletes its key.
  - **A checkbox:** "הניזוק עוסק מורשה (סכומים לפני מע״מ)" → `claimant_vat_registered`. Unchecking deletes the key.
  - **"Other" lines:** "+ הוסף שורה" adds a line with a label, an amount, a "חייב מע״מ" checkbox and a remove button. Hide the add button at 10 lines.
  - **Live preview:** the rows, VAT and total from `computeDamageTotals`, formatted with `formatILS`.

  Feed parse errors into the editor's existing validation list, so its save stays disabled while any amount is invalid. Follow how that list is built today.
- [ ] **Step 2: Run `npx tsc --noEmit`, `npm run build` and `npx vitest run`, and check all pass.**
- [ ] **Step 3: Verify in the browser.**
  - Run the production build on :3101 (see the memory note on worktree dev servers). The user signs in in the Browser pane.
  - On a dev `third_party_report` claim:
    - Enter repair 7370 and assessor fee 677.97, then save. A new demand PDF appears with the acceptance rows and total 9,496.60 ₪, and the checklist's מכתב דרישה item is done.
    - Tick עוסק מורשה, then save. The total becomes 8,047.97 ₪.
    - Clear the repair amount, then save. The מכתב דרישה item flips back to missing.
    - Click save twice quickly. Exactly one `demand_form` row remains: check with a service-role query, as in the PR #106 verification.
  - Take a screenshot for the PR.
- [ ] **Step 4: Commit** with message `feat(cockpit): damages fields on third-party-report claims`.

### Task 8: Docs and PR

**Files:**
- Modify: `docs/claim-management.md` (the demand form now carries damages; the checklist rule), `docs/app-map.md` (`lib/demand/damages.ts`, `cleanup.ts`, `DamagesFields.tsx`), `docs/status.md` (a done entry)

**Steps:**
- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Open the PR.**
  - Attach the sample PDF rendered from `sample-claim.ts`, not from a real claim, and the screenshot.
  - State **"no migration"**.
  - State the behaviour change: the מכתב דרישה item now waits for a repair amount.
  - Note that stage 2 (extraction) is separate.
