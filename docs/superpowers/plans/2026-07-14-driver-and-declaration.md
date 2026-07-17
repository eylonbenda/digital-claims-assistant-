# Driver Details + Insured Declaration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the driver (פרטי הנהג) and insured-declaration (הצהרת המבוטח) sections that every accident-notice template already reserves coordinate slots for, by collecting the data in the wizard and mapping it through `toClaimData`.

**Architecture:** Collection-side wiring only. Extend the wizard `State` and the shared `toClaimData` mapper (Task 1, pure + unit-tested), then add the driver step and declaration UI to the wizard (Task 2, build- + preview-verified). No PDF-engine change, no DB migration — `State` is persisted verbatim in `summary_json.collected` and the agent side re-derives `ClaimData` via the same `toClaimData`.

**Tech Stack:** Next.js 16 + TypeScript + React (RTL), Vitest.

## Global Constraints

- English code identifiers, Hebrew UI strings.
- `toClaimData` is called on **both** the client (preview) and the server (submit re-derive), and must not throw on **legacy** `collected` payloads that predate the new `driver`/`declaration` blocks — access them defensively.
- Declaration date renders **DD/MM/YYYY** on the PDF; `accident.date` ISO behavior is left unchanged (out of scope).
- Hebrew is drawn in logical order — no manual reversal anywhere.
- Branch `feat/driver-and-declaration` is already checked out. Stage only files named in each task (`git add <exact paths>`), never `git add -A` — the working tree has unrelated untracked artifacts.
- Spec: `docs/superpowers/specs/2026-07-14-driver-and-declaration-design.md`.

---

### Task 1: Extend `State` + `toClaimData` (driver + declaration mapping)

**Files:**
- Modify: `web/src/lib/collection/claim-state.ts`
- Modify: `web/src/components/collection/CollectionWizard.tsx` (only `EMPTY`, to keep the build green)
- Test: `web/src/lib/collection/claim-state.test.ts` (create)

**Interfaces:**
- Consumes: `ClaimData`, `Fault`, `InsuranceType` from `@/lib/formfill/types`.
- Produces:
  - `State` gains `driver: { isInsured: boolean | null; first_name: string; last_name: string; id_number: string; license_number: string; relation_to_insured: string }` and `declaration: { data_consent: boolean; poa_third_party: boolean; signed_date: string }`.
  - `toClaimData(s: State): ClaimData` now also emits `driver` (when `isInsured !== null`) and `declarations`.
  - Task 2 relies on these exact field names.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/collection/claim-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toClaimData, type State } from "./claim-state";

const base: State = {
  consent: true,
  injuries: false,
  policyInsurer: "menora",
  insuranceType: "comprehensive",
  insured: { first_name: "דנה", last_name: "לוי", id_number: "312345678", mobile: "0501234567", city: "חיפה" },
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "12-345-67", manufacturer: "טויוטה קורולה", year: "2020" },
  accident: { date: "2026-07-10", time: "08:30", location: "צומת", description: "פגיעה מאחור" },
  fault: "third_party",
  thirdParty: { present: false, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
  documents: [],
};

describe("toClaimData — driver", () => {
  it("copies the insured into driver when the insured was driving", () => {
    const d = toClaimData({ ...base, driver: { ...base.driver, isInsured: true } });
    expect(d.driver).toEqual({
      first_name: "דנה",
      last_name: "לוי",
      id_number: "312345678",
      relation_to_insured: "המבוטח",
    });
  });

  it("uses the other driver's details when the insured was not driving", () => {
    const d = toClaimData({
      ...base,
      driver: { isInsured: false, first_name: "רון", last_name: "כהן", id_number: "98765432", license_number: "5566778", relation_to_insured: "אח" },
    });
    expect(d.driver).toEqual({
      first_name: "רון",
      last_name: "כהן",
      id_number: "98765432",
      license_number: "5566778",
      relation_to_insured: "אח",
    });
  });

  it("omits driver entirely when the driver question was not answered", () => {
    expect(toClaimData(base).driver).toBeUndefined();
  });
});

describe("toClaimData — declaration", () => {
  it("fills signatory + DD/MM/YYYY date + data_consent, no poa when no third party", () => {
    const d = toClaimData({ ...base, declaration: { data_consent: true, poa_third_party: true, signed_date: "2026-07-14" } });
    expect(d.declarations).toEqual({
      signatory_name: "דנה לוי",
      date: "14/07/2026",
      data_consent: true,
    });
  });

  it("includes poa_third_party only when a third party is present", () => {
    const d = toClaimData({
      ...base,
      thirdParty: { present: true, name: "רון", phone: "", plate: "1-2-3", insurer: "כלל" },
      declaration: { data_consent: true, poa_third_party: true, signed_date: "2026-07-14" },
    });
    expect(d.declarations?.poa_third_party).toBe(true);
  });
});

describe("toClaimData — backward compatibility", () => {
  it("does not throw on legacy state lacking driver/declaration blocks", () => {
    const legacy = { ...base } as Partial<State>;
    delete (legacy as Record<string, unknown>).driver;
    delete (legacy as Record<string, unknown>).declaration;
    expect(() => toClaimData(legacy as State)).not.toThrow();
    expect(toClaimData(legacy as State).driver).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/collection/claim-state.test.ts`
Expected: FAIL — `d.driver` is `undefined` where a value is expected / `declarations` missing (the current `toClaimData` emits neither).

- [ ] **Step 3: Add the two new blocks to `State`**

In `web/src/lib/collection/claim-state.ts`, add these two properties to the `State` type (place `driver` right after `insured`, and `declaration` right after `thirdParty`):

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

```ts
  declaration: {
    data_consent: boolean;
    poa_third_party: boolean;
    signed_date: string; // ISO yyyy-mm-dd, captured when data_consent is first ticked
  };
```

- [ ] **Step 4: Add the date helper + driver/declaration mapping to `toClaimData`**

In the same file, add a module-level helper above `toClaimData`:

```ts
// ISO yyyy-mm-dd -> dd/mm/yyyy (Israeli form convention). Passes through anything else.
function formatDateIL(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
```

Then, inside the object returned by `toClaimData`, add these two blocks. Access `s.driver` and `s.declaration` defensively (`?.`) so legacy `collected` payloads don't throw:

```ts
    // Driver — only once the "who was driving" question is answered. When the insured
    // drove, copy their identity into the driver section the forms expect.
    ...(s.driver?.isInsured == null
      ? {}
      : {
          driver: s.driver.isInsured
            ? {
                first_name: s.insured.first_name,
                last_name: s.insured.last_name,
                id_number: s.insured.id_number,
                relation_to_insured: "המבוטח",
              }
            : {
                first_name: s.driver.first_name,
                last_name: s.driver.last_name,
                id_number: s.driver.id_number,
                ...(s.driver.license_number ? { license_number: s.driver.license_number } : {}),
                ...(s.driver.relation_to_insured ? { relation_to_insured: s.driver.relation_to_insured } : {}),
              },
        }),
    // Insured declaration (bottom-of-form). signatory + date always; poa only when a TP exists.
    ...(s.declaration
      ? {
          declarations: {
            signatory_name: `${s.insured.first_name} ${s.insured.last_name}`.trim(),
            ...(s.declaration.signed_date ? { date: formatDateIL(s.declaration.signed_date) } : {}),
            data_consent: s.declaration.data_consent,
            ...(s.thirdParty.present ? { poa_third_party: s.declaration.poa_third_party } : {}),
          },
        }
      : {}),
```

Note: `signatory_name` may be `""` on an empty preview — harmless, the engine skips empty text and `false`/`no` checkboxes.

- [ ] **Step 5: Keep the wizard compiling — extend `EMPTY`**

In `web/src/components/collection/CollectionWizard.tsx`, add the two blocks to the `EMPTY` constant (matching the `State` shape) so the file still type-checks. Add `driver` after `insured` and `declaration` after `thirdParty`:

```ts
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
```
```ts
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/collection/claim-state.test.ts`
Expected: PASS (all specs).

- [ ] **Step 7: Type-check the whole app**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/collection/claim-state.ts web/src/lib/collection/claim-state.test.ts web/src/components/collection/CollectionWizard.tsx
git commit -m "feat: map driver + insured declaration in toClaimData

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wizard UI — "מי נהג" step + declaration block

**Files:**
- Modify: `web/src/components/collection/CollectionWizard.tsx`

**Interfaces:**
- Consumes: `State.driver`, `State.declaration`, `toClaimData` from Task 1; existing `Choice`, `Text`, `Row`, `set`, `s`, `canNext`, `STEP_TITLES` in the wizard.
- Produces: an 11-step wizard (driver inserted at index 3) with a gated submit button. No new exports.

- [ ] **Step 1: Add a local date helper**

Add a module-level helper near the top of `CollectionWizard.tsx` (below the imports):

```ts
// Local calendar date as ISO yyyy-mm-dd (avoids the UTC off-by-one of toISOString near midnight).
function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
```

- [ ] **Step 2: Insert "מי נהג" into `STEP_TITLES`**

Replace the whole `STEP_TITLES` array with (driver added after "הפרטים שלך"):

```ts
const STEP_TITLES = [
  "הסכמה",
  "נפגעים",
  "הפרטים שלך",
  "מי נהג",
  "הרכב שלך",
  "מתי ואיפה",
  "מה קרה",
  "מי אשם",
  "הצד השני",
  "מסמכים ותמונות",
  "סיכום ושליחה",
];
```

- [ ] **Step 3: Rewrite `canNext` for the new step numbering**

Replace the entire `canNext` function body's `switch` with this (insured=2, **driver=3**, vehicle=4, accident=5, description=6, fault=7, thirdParty=8):

```ts
  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return s.consent;
      case 1:
        return s.injuries !== null;
      case 2:
        return (
          filled(s.insured.first_name) &&
          filled(s.insured.last_name) &&
          filled(s.insured.id_number) &&
          filled(s.insured.mobile) &&
          filled(s.insured.city) &&
          filled(s.policyInsurer) &&
          filled(s.insuranceType)
        );
      case 3:
        return (
          s.driver.isInsured !== null &&
          (s.driver.isInsured ||
            (filled(s.driver.first_name) && filled(s.driver.last_name) && filled(s.driver.id_number)))
        );
      case 4:
        return filled(s.vehicle.plate) && filled(s.vehicle.manufacturer) && filled(s.vehicle.year);
      case 5:
        return filled(s.accident.date) && filled(s.accident.time) && filled(s.accident.location);
      case 6:
        return filled(s.accident.description);
      case 7:
        return s.fault !== null;
      case 8:
        return (
          s.thirdParty.present !== null &&
          (!s.thirdParty.present ||
            (filled(s.thirdParty.name) && filled(s.thirdParty.plate) && filled(s.thirdParty.insurer)))
        );
      default:
        return true;
    }
  };
```

- [ ] **Step 4: Renumber the existing render blocks (steps 3→9 shift +1)**

In the JSX render section, change these `step === N` guards, working **from the highest number down** to avoid collisions. Each is the opening of a block `{step === N && (`:

- `{step === 9 && (`  →  `{step === 10 && (`   (summary)
- `{step === 8 && (`  →  `{step === 9 && (`    (documents)
- `{step === 7 && (`  →  `{step === 8 && (`    (third party)
- `{step === 6 && (`  →  `{step === 7 && (`    (fault)
- `{step === 5 && (`  →  `{step === 6 && (`    (description)
- `{step === 4 && (`  →  `{step === 5 && (`    (when/where)
- `{step === 3 && (`  →  `{step === 4 && (`    (vehicle)

Leave `step === 0/1/2` unchanged.

- [ ] **Step 5: Insert the driver step block**

Immediately **after** the insured block (`{step === 2 && ( … )}`) and **before** the now-renumbered vehicle block (`{step === 4 && (`), insert:

```tsx
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold">מי נהג ברכב בזמן התאונה?</h2>
            <div className="mt-4">
              <Choice<"insured" | "other">
                value={s.driver.isInsured === null ? null : s.driver.isInsured ? "insured" : "other"}
                options={[
                  { v: "insured", label: "אני (המבוטח)" },
                  { v: "other", label: "מישהו אחר" },
                ]}
                onChange={(v) => set({ driver: { ...s.driver, isInsured: v === "insured" } })}
              />
            </div>
            {s.driver.isInsured === false && (
              <div className="mt-4 space-y-3">
                <Text required label="שם פרטי" value={s.driver.first_name} onChange={(v) => set({ driver: { ...s.driver, first_name: v } })} />
                <Text required label="שם משפחה" value={s.driver.last_name} onChange={(v) => set({ driver: { ...s.driver, last_name: v } })} />
                <Text required label="תעודת זהות" value={s.driver.id_number} onChange={(v) => set({ driver: { ...s.driver, id_number: v } })} />
                <Text label="מספר רישיון נהיגה" value={s.driver.license_number} onChange={(v) => set({ driver: { ...s.driver, license_number: v } })} />
                <Text label="קרבה למבוטח" value={s.driver.relation_to_insured} onChange={(v) => set({ driver: { ...s.driver, relation_to_insured: v } })} placeholder="בן/בת זוג, עובד, בן משפחה…" />
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: Update the required-fields hint step list**

Find the footer hint line:

```tsx
      {step < last && [2, 3, 4, 5, 7].includes(step) && !canNext() && (
```

Replace the array with the new indices of the steps that have required text fields (insured=2, driver=3, vehicle=4, accident=5, description=6, thirdParty=8):

```tsx
      {step < last && [2, 3, 4, 5, 6, 8].includes(step) && !canNext() && (
```

- [ ] **Step 7: Add a driver row to the summary list**

In the renumbered summary block (`step === 10`), inside the `<dl>`, add a driver `<Row>` right after the "רכב" row:

```tsx
              <Row k="נהג" v={s.driver.isInsured === false ? `${s.driver.first_name} ${s.driver.last_name}`.trim() || "—" : s.driver.isInsured ? "המבוטח" : "—"} />
```

- [ ] **Step 8: Add the declaration block to the summary step**

In the summary block (`step === 10`), insert this **immediately before** the `{submitError && ( … )}` element (so it sits just above the submit area):

```tsx
            <div className="mt-5 rounded-xl border border-zinc-200 p-4">
              <p className="text-sm font-medium">הצהרת המבוטח</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                אני החתום/ה מטה מצהיר/ה כי הפרטים שמסרתי נכונים ומלאים, ומסכים/ה כי המידע יועבר
                לחברת הביטוח ולסוכן לצורך טיפול בתביעה, לרבות העברת מידע מהאגף לרישוי במשרד התחבורה.
              </p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={s.declaration.data_consent}
                  onChange={(e) =>
                    set({
                      declaration: {
                        ...s.declaration,
                        data_consent: e.target.checked,
                        signed_date: e.target.checked ? s.declaration.signed_date || todayISO() : "",
                      },
                    })
                  }
                  className="mt-1 h-5 w-5"
                />
                <span className="text-sm">אני מאשר/ת את ההצהרה ואת העברת המידע.</span>
              </label>
              {s.thirdParty.present && (
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={s.declaration.poa_third_party}
                    onChange={(e) => set({ declaration: { ...s.declaration, poa_third_party: e.target.checked } })}
                    className="mt-1 h-5 w-5"
                  />
                  <span className="text-sm">
                    אני מייפה את כוח חברת הביטוח לטפל בתביעת צד ג' (סעיף 68 לחוק חוזה הביטוח).
                  </span>
                </label>
              )}
              <p className="mt-3 text-xs text-zinc-500">
                חתימה: <span className="font-medium">{`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"}</span>
                {s.declaration.signed_date && <> · {formatDateILDisplay(s.declaration.signed_date)}</>}
              </p>
            </div>
```

Add this module-level helper near `todayISO` (used only for the on-screen preview date):

```ts
const formatDateILDisplay = (iso: string) => iso.split("-").reverse().join("/");
```

- [ ] **Step 9: Gate the submit button on `data_consent`**

Find the submit button in the footer:

```tsx
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitBusy}
            className="flex-1 rounded-lg bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {submitBusy ? "שולח…" : "שליחה לסוכן"}
          </button>
```

Change the `disabled` prop to also require consent:

```tsx
            disabled={submitBusy || !s.declaration.data_consent}
```

- [ ] **Step 10: Type-check + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 11: Preview-verify the flow**

Start the dev server (preview_start / `npm run dev`), open `/c/demo`, and walk the wizard:
- Confirm a **"מי נהג"** step appears after "הפרטים שלך"; selecting "מישהו אחר" reveals the 5 driver fields and blocks "המשך" until name + ID are filled.
- On the summary step, confirm the **הצהרת המבוטח** block shows the signatory name, that ticking the consent enables "שליחה לסוכן", and that the סעיף 68 checkbox appears only when a third party was reported.
- With insurer = מנורה, click **"צור טופס ממולא"** and confirm the generated PDF now shows the driver (פרטי הנהג) and the declaration name/date at the bottom.

Capture a `preview_screenshot` of the summary step + the filled PDF as proof.

- [ ] **Step 12: Commit**

```bash
git add web/src/components/collection/CollectionWizard.tsx
git commit -m "feat: driver step + insured declaration in collection wizard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Driver step after "הפרטים שלך", insured-vs-other, identity+license, validation → Task 2 Steps 2–6; mapping → Task 1 Step 4. ✅
- Declaration block on summary step, signatory + DD/MM/YYYY date, `data_consent` always + required, `poa_third_party` only when TP present → Task 1 Step 4 (mapping) + Task 2 Steps 8–9 (UI + gate). ✅
- No engine change / no migration → nothing in the plan touches `engine.ts` or `db/`. ✅
- Backward-compat for legacy `collected` → Task 1 Step 4 (defensive `?.`) + test in Step 1. ✅
- Summary driver row → Task 2 Step 7. ✅

**Placeholder scan:** none — every code step shows full code; the renumber step lists each exact literal change.

**Type consistency:** `driver`/`declaration` field names identical across the `State` type (T1 S3), `EMPTY` (T1 S5), `toClaimData` (T1 S4), and all wizard handlers (T2). Date helpers: `formatDateIL` (PDF value, claim-state.ts), `todayISO` + `formatDateILDisplay` (wizard, on-screen only) — distinct names, no collision.
