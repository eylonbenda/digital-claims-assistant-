# Spec — Driver details + insured declaration in the accident-notice flow

**Date:** 2026-07-14
**Status:** approved design, ready for plan
**Scope:** collection-side wiring only. No engine change, no DB migration.

## Problem

The per-insurer accident-notice templates already reserve coordinate slots for two
sections that never get filled, because the collection wizard never produces the data:

1. **פרטי הנהג (driver)** — templates map `driver.first_name / last_name / id_number /
   license_number / license_type / license_date / relation_to_insured` (e.g.
   `web/src/lib/formfill/templates/menora.ts`), but the wizard has no "who was driving"
   step and `toClaimData` (`web/src/lib/collection/claim-state.ts`) emits no `driver` block.
2. **הצהרת/הסכמת המבוטח (declaration)** — templates map `declarations.signatory_name`,
   `declarations.date`, and the `poa_third_party` / `data_consent` consent checkboxes
   (harel, ayalon, aig, libra, migdal, menora…), but `toClaimData` emits no `declarations`
   block, so the bottom-of-form declaration prints blank.

Result: every generated form has empty driver and declaration sections.

## Decisions (from brainstorming)

- **Signature:** name + date + consent only. No drawn signature image (the engine has no
  image path; that would be a separate, larger change). Documented as a possible follow-up.
- **Driver depth:** identity + license — name, ID, license number, relation to insured.

## Design

Two files touched: `web/src/lib/collection/claim-state.ts` and
`web/src/components/collection/CollectionWizard.tsx`. Plus a Vitest unit test.

### 1. "מי נהג" step (driver)

New wizard step inserted **after "הפרטים שלך"** (order matches the form: insured → driver
→ vehicle).

- Question: *"מי נהג ברכב בזמן התאונה?"* → **אני (המבוטח)** / **מישהו אחר**.
- **אני** → `toClaimData` copies the insured's `first_name`, `last_name`, `id_number` into
  the `driver` block with `relation_to_insured: "המבוטח"`.
- **מישהו אחר** → reveal fields: שם פרטי, שם משפחה, ת.ז, מספר רישיון נהיגה, קרבה למבוטח.
- **Validation (`canNext`):** must pick one; if "מישהו אחר", require first name + last name
  + ID. License number and relation are optional (client may not have them on hand).

State additions (in `State`):

```ts
driver: {
  isInsured: boolean | null;
  first_name: string;
  last_name: string;
  id_number: string;
  license_number: string;
  relation_to_insured: string;
};
```

`toClaimData` emits `driver.{first_name, last_name, id_number, license_number,
relation_to_insured}` mapping to the existing template slots.

### 2. הצהרת/הסכמת המבוטח (declaration)

Rendered as a block at the bottom of the **summary step** (last step), before "שליחה לסוכן".

- Declaration text (insured authorizes handling + agrees to data transfer to
  משרד התחבורה / מאגר מידע).
- **Signatory name** — auto-filled from the insured's full name (read-only display).
- **Date** — captured into State when the client ticks agreement (persists in `collected`
  for audit; server re-derives the same value). Formatted **DD/MM/YYYY** on the PDF.
- **Consents:**
  - `data_consent` — always shown; **required to submit** (gates the green submit button).
  - `poa_third_party` (ייפוי כוח סעיף 68) — shown **only when a third party is present**
    (`s.thirdParty.present`).

State additions:

```ts
declaration: {
  data_consent: boolean;
  poa_third_party: boolean;
  signed_date: string; // ISO yyyy-mm-dd, set when data_consent first ticked
};
```

`toClaimData` emits:

```ts
declarations: {
  signatory_name: `${insured.first_name} ${insured.last_name}`.trim(),
  date: <signed_date formatted DD/MM/YYYY>,
  data_consent: declaration.data_consent,
  ...(thirdParty.present ? { poa_third_party: declaration.poa_third_party } : {}),
}
```

### Wiring details

- `STEP_TITLES` gains "מי נהג"; step indices in `canNext` shift accordingly.
- `EMPTY` and the `StatePrefill` type in the wizard gain the two new blocks.
- The green **"שליחה לסוכן"** button is disabled until `data_consent` is ticked (the last
  step currently has no gate).
- Summary step's `<Row>` list gains a driver line ("נהג": insured / other driver's name).

## Out of scope / notes

- **Drawn signature image** — deferred; needs engine image-draw support + canvas UI +
  storage + per-template signature-box coords.
- **`accident.date` ISO quirk** — `accident.date` flows to the PDF as ISO `YYYY-MM-DD`
  from the `type="date"` input. The declaration date is formatted DD/MM/YYYY; normalizing
  the accident date is a separate concern, left alone here.
- No DB migration: `State` is persisted verbatim in `summary_json.collected`; the agent
  side re-derives `ClaimData` via the shared `toClaimData`.

## Testing

Vitest unit test on `toClaimData` (new `web/src/lib/collection/claim-state.test.ts`):

- driver = insured → `driver` copied from insured, `relation_to_insured: "המבוטח"`.
- driver = other → `driver` from the collected driver fields.
- declaration → `signatory_name`, `date` (DD/MM/YYYY), `data_consent`; `poa_third_party`
  present only when a third party is present.
