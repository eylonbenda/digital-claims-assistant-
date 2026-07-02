# AI Document Validation — spec

> **Status:** spec / not built (2026-06-28). Builds on the document-upload step (commits `7b21471`,
> `34446cf`). Implements the "is this actually a driver's licence?" layer.

## Problem

The upload route's magic-byte sniff guarantees a file is a *real* image/PDF, but not that it's the
*right* document. This layer validates that an uploaded file matches its declared slot
(`drivers_license`, `vehicle_reg`, `car_photo`), is legible, and matches the claim — then warns the
claimant inline and flags it for the agent.

## Architecture

Runs **server-side after the sniff + Storage upload succeed**, inside (or just after)
`POST /api/claims/documents`. Recommended **synchronous with a hard timeout (~6s)**: the claimant
gets an immediate verdict, and on any AI failure/timeout the upload still succeeds as `unchecked`.
**The AI never blocks an upload.**

```
sniff ✓ → store ✓ → insert row ✓ → validateDocument(image, expectedType) ──6s timeout──┐
                                          │                                              │
                                   verdict JSON ───────────────► update row + return ◄──┘ (timeout → unchecked)
```

## The Claude call — `web/src/lib/ai/validate-document.ts`

- **Input:** the image bytes (base64 image block) + the expected `doc_type`.
- **Model:** vision-capable. Cheap/fast classify pass → **Haiku**; escalate to **Sonnet** if field
  extraction needs more reliability. **Model IDs + the vision image-block format MUST come from the
  `claude-api` skill at build time — do not hardcode from memory.**
- **Structured output (forced JSON):**

```jsonc
{
  "is_expected_type": false,
  "detected_type": "vehicle_reg",   // drivers_license | vehicle_reg | car_photo | other_document | not_a_document
  "legible": true,
  "confidence": "high",             // high | medium | low
  "issues": ["זהו רישיון רכב ולא רישיון נהיגה"],  // Hebrew, claimant-readable
  "extracted": { "name": "...", "id_number": "...", "license_number": "...", "plate": "...", "expiry": "..." }
}
```

- **System prompt (gist):** "You validate documents for an Israeli car-insurance claim. Given an
  image and the EXPECTED type, judge whether it matches, whether it's legible, and extract key
  fields. Base only on the image; don't invent." Mirror the guarded, structured style of `analyze.ts`.

## Deterministic cross-checks (after extraction — no AI)

| Doc | Check | Warn when |
|---|---|---|
| `drivers_license` | name / id vs `insured` | mismatch |
| `drivers_license` | `expiry` vs today | expired |
| `vehicle_reg` | `plate` vs `vehicle.plate` | mismatch |

## UX — warn, never block

- New per-file state **`warn`** alongside `done`/`error`. If `!is_expected_type`, `!legible`, or a
  cross-check fails → soft inline notice (e.g. *"נראה שזה רישיון רכב ולא רישיון נהיגה — להחליף?"*)
  with a **"keep anyway"** action.
- **Critical:** a real document the model misreads must still be submittable. False positives are
  tolerable as warnings; a hard block is not.

## Persistence & agent side

- **Migration 004:** add `ai_verdict jsonb`, `ai_checked_at timestamptz` to `claim_documents`.
- Agent dashboard surfaces flagged docs ("3 docs, 1 needs review") — turns this into agent value,
  not just claimant UX.

## ⚠️ Privacy / compliance (decide before building)

Validating means **ID/licence images leave the system to Anthropic** (a sub-processor). Under
חוק הגנת הפרטיות this is a conscious call:
- Anthropic API **does not train** on the data, but it processes sensitive PII.
- **To do:** name Anthropic as a sub-processor in the privacy notice, add a consent line covering
  automated document checks, consider per-tenant opt-out, keep images server-side (never expose the
  bytes to the client).

## Cost / performance

- ~1 vision call per typed doc. Haiku vision ≈ fractions of a cent/image, ~1–3s. Add a "בודק…" state.
- **Scope to typed docs** (`drivers_license`, `vehicle_reg`) where slot-matching matters; skip or
  lightly check `car_photo` (just "contains a vehicle / legible").

## OCR vendor & accuracy KPIs

When OCR is added (phase 2+) to extract structured fields from documents:

**Vendor choice:**
- ✅ **Google Cloud Vision** — supports Hebrew; use `languageHints: ["he"]` when auto-detection is unreliable.
- ✅ **Azure AI Vision (Read API)** — supports Hebrew.
- ❌ **AWS Textract** — does NOT support Hebrew. Do not prototype on it.

**Critical fields — always Human-in-the-loop (never auto-commit):**

| Field | Why it matters |
|---|---|
| Plate number | Drives TP claims, route decisions |
| Policy number | Required for form fill and insurer routing |
| Accident date | Determines limitation clock |
| IBAN / bank account | Payee routing — wrong payee = serious error |
| Invoice amount | Drives reimbursement; מנורה requires חשבונית + קבלה separately |
| Presence of אישור אי-הגשת תביעה | Blocking dependency; absence = clock blocked |

**Per-document-type accuracy target (not one global KPI):**

| Doc type | Accuracy target | Notes |
|---|---|---|
| `drivers_license` | 95%+ on clean scans | Structured, predictable layout |
| `vehicle_reg` | 95%+ on clean scans | |
| `garage_invoice` | 90%+ | Layout varies by garage |
| `repair_receipt` | 85%+ | Handwritten elements possible |
| `appraiser_report` | 80%+ on key fields | Free-form prose sections |
| `car_photo` | N/A — classify only (contains a vehicle / legible) | |

Image quality is the dominant accuracy driver (NIST research); add photo-guidance prompts in the wizard.

## Phasing

1. **Classify only** — `is_expected_type` + `legible` → inline warning. *(80% of the value, smallest build.)*
2. **Extract + cross-check** — name / plate / expiry vs claim.
3. **Agent surfacing** — flagged-doc review in the dashboard.

## Build checklist (Phase 1)

- `migration 004` (verdict columns)
- `web/src/lib/ai/validate-document.ts` (**via the `claude-api` skill**)
- wire into the upload route with timeout + graceful fallback
- wizard `warn` state + "keep anyway"
- privacy-notice / consent copy
