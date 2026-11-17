# Demand form — damages section (פירוט הנזק), stage 1: manual amounts

**Date:** 2026-11-16 · **Status:** draft, awaiting approval
**Builds on:** the generic demand form (`docs/superpowers/specs/2026-11-10-demand-form-design.md`, PR #106). This work starts after #106 merges.
**Informed by:**
- A real claim bundle the user shared on 2026-11-16: an assessor report, an assessor-fee invoice and receipt, a garage invoice, a vehicle licence, and a no-claim confirmation. It carries client PII and is **not** in the repo; the figures below are quoted only to illustrate the shape.
- Insurer pages (הפניקס, ליברה, כלל) read on 2026-11-14.

## Intent

The demand form from PR #106 carries no amounts, but a demand to the third party's insurer is a demand for money. After the repair, the פקידה has the assessor report (דו"ח שמאי), the assessor's fee invoice (חשבון שכ"ט שמאי) and the garage invoice. The letter has to state what is being demanded:
- repair cost;
- diminished value (ירידת ערך), if any;
- assessor fee;
- other costs, case by case.

The user decided (2026-11-16) on approach A in two stages:
1. **This spec.** Damage amounts on the claim, entered by the פקידה, printed as a "פירוט הנזק" section with a total.
2. **Later, separate spec.** Claude extracts the amounts from the uploaded documents and proposes them, filling the same fields. It waits on the open privacy decision in `docs/ai-doc-validation.md`.

Stage 1 must stand on its own: a usable letter with typed amounts. It must also be the exact data shape stage 2 fills.

## What the sample showed

These facts shape the design:
- **The documents arrive separately.** The assessor sends the report and the fee invoice. The garage issues the repair invoice. The single bundle the user had was assembled by the garage's claims department, and it is effectively our **output**: the submission package minus the demand letter. No document splitting is needed.
- **Repair.** The report gives labour, paint and parts, then a total before VAT (7,370 ₪), VAT at 18% (1,326.60 ₪), and a total including VAT (8,696.60 ₪). The garage invoice matches it to the agora.
- **Assessor fee.** It is a separate document from the report. It shows a fee, travel and office costs, a total before VAT (677.97 ₪), VAT (122.03 ₪), and a total of 800.00 ₪. Phoenix publishes 800 ₪ as its usual ceiling for an outside assessor.
- **Diminished value is not a field in the report.** Here the assessor's free-text remark says there is none. Per Libra, insurance history (עבר ביטוחי) is only needed when there is diminished value.
- **The claim number in the report belongs to the claimant's own insurer** (Libra, which commissioned the assessor). It is **not** the third-party insurer's claim number (`tp_claim_number`), and must never be filled from it.
- **The report's payout table pays the insured ("תשלום למבוטח"),** and the garage invoice is addressed to the insured.

## Goals

- The פקידה enters damage lines on a `third_party_report` claim:
  - fixed lines: repair, diminished value, assessor fee, towing;
  - any number of "other" lines, each with a free-text label and an amount (e.g. downtime, a replacement car).
- The demand form prints a "פירוט הנזק" section: one row per non-empty line, a VAT row, and a total.
- A "הניזוק עוסק מורשה" checkbox in the damages section sets the VAT basis:
  - unchecked (the default): amounts include VAT;
  - checked: amounts are printed before VAT, with no VAT row.
- Saving the amounts regenerates the demand form, so the stored PDF never lags the data.
- On this track, the checklist's מכתב דרישה item counts a **generated** form as done only once a repair amount has been entered. An uploaded insurer form still counts as before.

## Non-goals (stage 1)

- Extracting amounts from documents (stage 2).
- Checking the invoice against the report (stage 2, once both are extracted).
- Payee and bank details in the letter. That needs the open question of whether the garage is paid under an assignment (המחאת זכות) or the insured is paid. The sample points to the insured. Bank details stay a separate attachment.
- A narrative letter body. That would cover the paragraph text, a liability statement, and a payment-deadline clause like Gemini's "30 days per the claims-settlement circular". That clause misstates the circular: the insurer has 30 days to *decide* after receiving every document. Generated legal assertions stay out until someone verifies them.
- Making insurance history conditional on diminished value. It is a natural follow-up once diminished value is a known field, but it is a separate checklist change.
- Other tracks. The `own_policy` and `third_party_settlement` tracks have no demand form.

## Anti-goals

- **A wrong amount reaching the insurer.** Every amount on the letter is one a person typed or confirmed. The system never guesses one, and never shows a computed total that disagrees with its printed rows.
- **A truncated or shrunk-to-illegible amount.** The PR #106 renderer shrinks text to 8pt and then truncates with "…". That is acceptable for a long description, **never** for a money row. If the page is full, the layout makes room for the amounts, by using a second page or shortening other text, rather than cutting a number.
- **VAT applied twice or to the wrong line.** Diminished value is compensation, not a supply, so it carries no VAT.

## Approaches (decided)

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Claude extracts amounts, and a person confirms them. Built in two stages, manual fields first. | Most work, but it is what the user asked for. Stage 1 ships value and checks the letter's shape with the garage before any AI cost or privacy decision. |
| B | Manual entry only | Becomes stage 1 of A. |
| C | Parse the text layer of the "דטה קאר" report deterministically | Rejected. It works only for unscanned reports from one assessor-software vendor; scanned garage invoices and receipts, which are common, defeat it. |

## Design

### Data — on `ClaimData`, no migration

Add `damages` to `ClaimData` (`web/src/lib/formfill/types.ts`). Like the other agent-entered fields it is stored in `summary_json.form_data`, so there is no migration, and `effectiveClaimData` reads it as usual.

```ts
type DamageLine = { amount: number; vat: boolean };   // amount = before VAT, in ₪, 2 decimals
type Damages = {
  repair?: DamageLine;          // vat: true
  diminished_value?: DamageLine; // vat: false
  assessor_fee?: DamageLine;    // vat: true
  towing?: DamageLine;          // vat: true
  other?: { label: string; amount: number; vat: boolean }[];
  claimant_vat_registered?: boolean; // עוסק מורשה → letter shows amounts before VAT
};
```

**Why not the existing `claims.business_use` flag.** *(My call, found during review.)*
- Nothing in the app writes `business_use`. The wizard and every route only read it, so in practice it is always `false`.
- It also means something else: business *use* of the vehicle, not being registered for VAT.
- Keeping the switch inside `damages` means it is saved, validated and regenerated together with the amounts.

**Merge semantics.** The form-data route keeps replacing `form_data` wholesale, last write wins. `FormFieldEditor` holds the whole object, `damages` included, so a save round-trips it. *(My call: stage 2 will write extracted proposals somewhere other than `damages`, and only a person's confirmation copies them in.)*

**Amounts are stored before VAT, with a per-line VAT flag.** *(My call.)*
- This is how both the report and the invoices state them: a total before VAT, then a VAT row. Stage 2 can therefore extract the before-VAT figure directly.
- It avoids back-computing a net from a gross that has already been rounded.
- Check against the sample:
  - repair: 7,370 × 1.18 = 8,696.60, exact;
  - fee: 677.97 × 1.18 = 800.0046, which rounds to 800.00 and matches the invoice's own rounding line.

**Default VAT flags:**
- `true` for repair, assessor fee and towing;
- `false` for diminished value;
- `false` for "other" lines, with a checkbox to set it per line. A missing `vat` on an "other" line is read as `false`.

**The VAT rate** is a single constant, 18% (in force since 2025-01-01). It is not stored per claim. *(My call: a rate change is a code change. Claims already printed keep their PDFs.)*

### Validation — server side

`PATCH /api/claims/[id]/form-data` today accepts any object. Add a check for `form_data.damages`. Return 400 with a Hebrew error on failure. Nothing else about the route changes.
- Every amount is a finite number, ≥ 0, ≤ 1,000,000, and has at most 2 decimals.
- Every `other` label is non-empty after trimming and at most 60 characters.
- There are at most 10 `other` lines.

### Totals — one pure function

```ts
computeDamageTotals(d: Damages | undefined)
  → { rows: { label: string; amount: number }[]; vat: number | null; total: number } | null
```
- Returns `null` when no line has an amount above 0.
- `rows` lists the non-empty lines in fixed order: repair, diminished value, assessor fee, towing, then the other lines in their entered order. Each amount is before VAT.
- `vat` is the rounded VAT on the VAT-able lines. It is `null` when `claimant_vat_registered` is true.
- `total` is the sum of the rows plus `vat`.
- Rounding is to agorot, done once per VAT computation, never per display.

Both the letter and the cockpit preview use this function, so they cannot disagree.

### Letter

`buildDemandData` gains a "פירוט הנזק" section, placed after the third-party sections and before "נוסף":
- one row per entry in `computeDamageTotals(...).rows`, formatted like `7,370.00 ₪`;
- a "מע"מ (18%)" row, when `vat` is not null;
- a bold "סה"כ לדרישה" row.

The heading notes which basis applies: "(כולל מע"מ)" or "(לפני מע"מ)". When there are no amounts, the section is **omitted**: no empty money rows, unlike the other sections' blank lines. *(My call: a blank "סה"כ" invites a demand for zero.)*

Rendering:
- Money rows are never shrunk below the body size and never truncated (anti-goal).
- If the content no longer fits one page, the renderer may add a second page. The PR #106 single-page assumption gives way here, and its tests change accordingly.
- Numbers are drawn so that "₪" and the digits keep their order in RTL. Verify by rendering, the same lesson as the bidi digit fix.

### Editing — cockpit

A "פירוט הנזק" section in `FormFieldEditor`, shown only on `third_party_report`:
- four number inputs for the fixed lines;
- an "+ הוסף שורה" list for the other lines (label, amount, VAT checkbox, remove);
- a live preview of the totals from `computeDamageTotals`;
- an input hint: "לפני מע״מ".

### Regenerate on save

After the form-data route saves successfully on a `third_party_report` claim, it schedules `generateDemandForm(id)` with `after()`, the same way the classify route does. This covers **any** form-data save on that track, not only damages: it also fixes the existing staleness where editing the appraiser name needed a manual regenerate. A failure is reported through `serverError` and never fails the save.

The VAT switch lives in `form_data`, so this one trigger covers it. No other route needs to regenerate.

**Overlapping regenerations must converge to one row.** Today `generateDemandForm` reads the prior rows, inserts the new one, then deletes exactly those prior ids. Two overlapping runs each delete only the old row, which leaves **two** new rows.
- Change the cleanup step: after its insert, a run deletes every `demand_form` row of the claim, and its Storage object, except the **newest by `created_at`**.
- Whichever run finishes last then leaves exactly one row, with no lock and no migration.
- The editor saves on an explicit button click, so overlaps are rare, but the acceptance criterion must hold anyway.

### Checklist done rule

On `third_party_report`, the `demand_form` item is done when either:
- a `demand_form` document was **uploaded** (unchanged); or
- a generated demand form exists **and** `damages.repair.amount > 0`.

**How the condition reaches the checklist.** `formFacts` gains a second argument, `repairPriced: boolean`, and adds `"demand_form"` to `generatedDocTypes` only when a demand form exists **and** `repairPriced` is true. `computeChecklist` stays unchanged.

Each of the four readers derives `repairPriced` from `effectiveClaimData(summary_json).damages?.repair?.amount > 0`:
- dashboard `page.tsx`;
- `brief/brief.ts`;
- `tasks/runner.ts`;
- `outbound/load.ts`.

`page.tsx` and `brief.ts` already select `summary_json`. `runner.ts` and `outbound/load.ts` add it to their selects. That is server-side only, and nothing new reaches a client. *(My call: a column on `generated_forms` would need a migration and could go stale.)*

**Task engine.** `generateDemandForm` already calls `runEngine(doc_uploaded, demand_form)` after each insert, so the regeneration that follows saving a repair amount re-runs the engine with the item now done. Nothing extra is needed.

**Existing claims.** The engine is forward-only: tasks it has completed stay completed. So the rule change only flips the live checklist item back to missing on claims that already have an amount-less generated form. Those exist only between the #106 deploy and this one. *(My call: no cutoff date, unlike `BOTH_SIDES_LICENCE_FROM`, because the flip is the intended behaviour and opens no chase tasks. The item is `clientSuppliable: false`.)*

*(My call, and the most visible behaviour change, so check it: today the item ticks at claim creation, once the amount-less form is generated. After this change it ticks only after the repair is priced. It does not delay submission, since the report and the garage invoice are already blocking late items on this track. It does stop an amount-less letter from silently satisfying the checklist.)*

## Constraints

- **No migration.** `damages` lives in `summary_json.form_data`.
- Hebrew UI strings go in the copy modules, identifiers in English.
- Hebrew is drawn in logical order and never reversed.
- Next.js 16: read `web/node_modules/next/dist/docs/` before touching routes.
- Work in a worktree branch off `origin/main`, after #106 merges. One PR, no self-merge.
- Done means `npx tsc --noEmit`, `npm run build` and `npx vitest run` are all green.
- The PR includes a demand PDF rendered from `sample-claim.ts` with damages filled in. Use the sample's figures, not a real claim.

## Left to the builder

- The exact layout of the damages section. Whether it reserves a fixed block on page 1 or flows onto a second page is the builder's choice; the only requirement is that money rows are never shrunk or truncated. With several third parties and ten "other" lines, one page will overflow, so a second page must be possible.
- Whether the damages inputs are a sub-component of `FormFieldEditor`.

## Acceptance

- Entering a repair amount of 7,370 (VAT) and an assessor fee of 677.97 (VAT), with "עוסק מורשה" unchecked, prints these rows:
  - repair 7,370.00 ₪;
  - assessor fee 677.97 ₪;
  - VAT 1,448.63 ₪;
  - total 9,496.60 ₪.
- The same figures with "עוסק מורשה" checked print the two rows and a total of 8,047.97 ₪, with no VAT row.
- Two overlapping regenerations leave exactly one `demand_form` row (unit-test the cleanup selection; check by hand on dev).
- A diminished-value line adds to the total without adding VAT.
- No amounts means no damages section in the PDF.
- On `third_party_report`, the מכתב דרישה item is undone with an amount-less generated form, and done after a repair amount is saved. An uploaded demand form is done either way.
- Saving form data on `third_party_report` replaces the demand PDF: exactly one `demand_form` row remains.
- An invalid amount (negative, NaN, three decimals, over 1,000,000) returns 400 and saves nothing.
- Unit tests cover `computeDamageTotals` (rounding, VAT switch, empty input, other lines), the validator, the letter rows and the done rule.
