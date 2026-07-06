# Architecture

> Companion to the visual architecture diagram. Details here: components, data model, AI design, security/privacy.

---

## 1. Overview
- **Frontend + Backend:** Next.js (App Router) + TypeScript, on Vercel. Two surfaces:
  1. **Collection web-app** (public, no login, access via signed token) — the client.
  2. **Agent dashboard** (authenticated) — the agent.
- **DB + Auth + Storage:** Supabase (Postgres, Supabase Auth, Storage).
- **AI:** Anthropic Claude SDK.
- **Deploy:** `git push` → Vercel.

Principle: the Next.js layer is the only boundary facing the client. No client touches the DB or Claude directly — everything goes through server actions / API routes.

---

## 2. Components & decisions
| Component | Choice | Why |
|---|---|---|
| App | Next.js App Router | UI + API in one place, server actions, streaming |
| Language | TypeScript | end-to-end type safety |
| DB | Supabase Postgres | managed, RLS, generous free tier |
| Auth | Supabase Auth | for agents; don't build auth yourself |
| Storage | Supabase Storage | private buckets + signed URLs for photos/docs |
| AI | Claude (Anthropic SDK) | `haiku-4-5` for cheap steps, `opus-4-8` for the final summary |
| Hosting | Vercel | zero ops |
| Jobs (future) | Inngest / Trigger.dev | reminders, async processing |
| Channel (future) | WhatsApp Business API via BSP | full automation after validation |

---

## 3. Data model (initial schema)

```
agencies        (id, name, created_at)
agents          (id, agency_id → agencies, auth_user_id, name, email, phone)
claims          (id, agent_id → agents, client_name, client_phone,
                 claim_type, status, urgent bool, access_token (unique),
                 policy_insurer, at_fault_insurer,
                 coverage_type,         -- comprehensive (מקיף) | third_party (צד ג')
                 garage_network_rider,  -- "נבחרת מוסכים" bool — restricts payable garages
                 policy_activated,      -- bool: did the client activate their OWN policy?
                                        --   forks third_party_report → residual-loss (הפסדים)
                 lien bool,             -- circumstance flags → conditional checklist
                 business_use bool,
                 theft bool,
                 sla_clock_started_at,  -- set when ALL required docs present (clock starts)
                 decision_due_at,       -- sla_clock_started_at + 30 calendar days
                 limitation_deadline,   -- 3y own-policy (§31) | 7y TP property tort
                 summary_json, checklist_state, created_at, submitted_at, closed_at)
                 -- claim_type: own_policy | third_party_report
                 --           | third_party_settlement | unknown
                 -- circumstance flags (bool, default false; migration 004) drive the
                 --   conditional checklist sections
claim_documents (id, claim_id → claims, type, storage_path,
                 mime, uploaded_at)
                 -- type: car_photo | drivers_license | vehicle_reg
                 --       | id_card | third_party_doc | police_report
                 --       | garage_invoice (חשבונית תיקון)
                 --       | repair_receipt (קבלה על תשלום בפועל — ≠ invoice)
                 --       | appraiser_report (דוח שמאי)
                 --       | assessor_fee_invoice | assessor_fee_receipt (שכ"ט שמאי + קבלה)
                 --       | no_claim_confirmation (אישור אי-הגשת תביעה)
                 --       | loss_confirmation (אישור הפסדים — ≠ no_claim_confirmation)
                 --       | insurance_history (עבר ביטוחי)
                 --       | lien_release (אישור הסרת שיעבוד)
                 --       | info_consent (הסכמה למסירת מידע / משרד הרישוי)
                 --       | power_of_attorney (ייפוי כוח, §68 חוק חוזה הביטוח)
                 --       | bank_details (טופס בנק / שיק מבוטל / IBAN)
                 --       | vat_offset_confirmation (אישור רו"ח על קיזוז מע"מ — עסקי)
                 --       | keys (מפתחות — גניבה) | demand_form | other
third_parties   (id, claim_id → claims, name, phone, id_number,
                 plate, insurer)
garages         (id, claim_id → claims, name, is_arranged bool,
                 -- is_arranged: "מוסך הסדר" — affects payment flow and checklist
                 contact_phone, vehicle_in_garage_at)
assessors       (id, claim_id → claims, name, contact_phone)
                 -- שמאי: independent + regulated; the product tracks/organises only.
                 -- Must never appear to direct שמאות or pay commission (regulatory prohibition).
witnesses       (id, claim_id → claims, name, phone, address)
injured_persons (id, claim_id → claims, name, id_number, address,
                 injury_nature, hospitalized bool, hospital, age)
payments        (id, claim_id → claims, payee_type, method, amount,
                 status, paid_at)
                 -- payee_type: client | garage | assessor
                 -- method: bank_transfer | check | assignment_of_rights (המחאת זכויות)
                 -- status: expected | paid | reconciled
tasks           (id, claim_id → claims, title, track, status,
                 due_at, assignee, created_at)
                 -- track: own_policy | third_party_report | third_party_settlement
                 -- status: todo | in_progress | blocked | done
generated_forms (id, claim_id → claims, kind, insurer, storage_path, created_at)
                 -- kind: accident_notice (הודעה על תאונה)
                 --       | demand_letter (מכתב דרישה — required for TP route)
                 --       | submission_packet (תיק הגשה — full doc bundle)
                 -- insurer: migdal | menora | hachshara | ... (which template was filled)
claim_notes     (id, claim_id → claims, body, created_at)
                 -- agent free-text state-of-play scratchpad (migration 005);
                 --   POST /api/claims/[id]/notes appends, shown on /dashboard/[id]
claim_events    (id, claim_id → claims, type, payload_json, created_at)
                 -- audit log: consent_given, step_completed,
                 --   classified, form_generated, status_changed ...
collection_progress  -- can live as JSON on claims or as a separate table
```

Notes:
- `access_token` — non-sequential identifier for client access (never expose `claims.id`).
- `summary_json` — the client's `collected` submission + Claude's structured output (`analysis`: summary + missing-info checklist). When the agent edits/completes the accident-notice fields, the corrected canonical `ClaimData` is stored alongside as `form_data` (`effectiveClaimData` prefers it over `collected`; the original `collected` is never mutated, for audit).
- **Per-track checklist** (implemented — `web/src/lib/claims/checklist.ts`) = a per-track config (`claim_type` → required docs/steps, grouped into `base` / `late` / `conditional` / `milestone` sections) ⊕ a presence check against `claim_documents` / collected fields. A **derived view, not a task engine** (the `tasks` table is reserved for phase-2 active workflow). `computeChecklist()` is a pure function, run server-side on the claim detail page.
  - Document items **auto-check** from `claim_documents` presence — uploaded at intake, or **by the agent from the dashboard with a type tag** (`POST /api/claims/[id]/documents`; MVP = Option A; a follow-up client/garage upload link is phase 2).
  - Conditional items (police report / keys / lien release / VAT offset / loss-vs-no-claim confirmation) are toggled by the claim's **circumstance flags** (`theft`, `lien`, `business_use`, `policy_activated`, `garage_network_rider`).
  - Pure action-milestones (e.g. "submitted to insurer", "car at garage", "payment received") are **manual ticks** (`PATCH /api/claims/[id]/checklist`), persisted in a small `checklist_state` JSON on `claims`. Ticking a **submit** or **payment** milestone also advances `claims.status` (→ `submitted` / `closed`, setting `submitted_at` / `closed_at`) so the hero badge can't disagree with the checklist — **forward-only**: unticking never downgrades.
- `claim_events` — full audit; important for regulation and debugging.
- ID numbers (`id_number`) → consider **field-level encryption** (beyond at-rest).

---

## 4. AI design (where Claude fits)

| Use | Model | Input | Output |
|---|---|---|---|
| Structure free-text / voice | haiku-4-5 | text / transcript | structured fields |
| Missing-info detection | haiku-4-5 | which fields / docs exist | missing checklist |
| Narrative signals | opus-4-8 | event description | `incident_kind` + `inferred_fault` (NOT the track) |
| **Final event summary** | opus-4-8 | all structured data | agent-readable summary |

**Implemented (MVP): two-layer classifier.** `web/src/lib/ai/analyze.ts` makes **one structured call** (`claude-opus-4-8`, adaptive thinking, `output_config.format` → JSON schema) that returns only *signals*: the Hebrew `summary`, `missing`, plus narrative-derived `incident_kind` and `inferred_fault`. The LLM **never picks the track** — a **deterministic pure function** (`web/src/lib/claims/classify.ts`) owns the decision so it stays auditable: Layer 1 (fact-driven) resolves `own_policy` vs. third-party from fault × identified-third-party × coverage type; Layer 2 (business choice) only *recommends* `third_party_report` vs. `third_party_settlement` and forces the agent to pick (`needsAgentChoice`). It also emits a `confidence`, a `viabilityWarning` (e.g. at-fault + no comprehensive), and a `faultMismatch` flag when stated fault conflicts with the narrative. The analysis is lazily computed once and cached in `summary_json.analysis` (`web/src/lib/claims/analysis-cache.ts`), keyed by an input hash so a data edit invalidates it. Default is Opus 4.8 per the claude-api skill (don't downgrade for cost without the user's call); override the tier via `CLAIMS_AI_MODEL`.

Principles (important for an AI product):
- **Structured outputs / tool calling** — not regex on prose. Always validate/parse the output.
- **Log every prompt + response from day one** — this is both the eval set and the debugging trail.
- **Small eval harness early** — even 20 labeled examples: "did this change help or hurt?"
- **Prompts in version control**, not hardcoded as strings.
- **Stream** the summary to the UI — perceived speed.
- **Per-request cost cap** + token tracking — AI margins erode quietly.
- **Privacy:** in MVP, **don't send ID images (ID / license) to the LLM**. Missing-info detection works on *metadata* (which docs were uploaded), not image content — so there's no need to send images at all. Automatic OCR = future phase, carefully.
- **OCR vendor (when built):** Google Cloud Vision **or** Azure Vision — both support Hebrew (use language hints). **AWS Textract does NOT support Hebrew** — do not prototype on it.
- **Human-in-the-loop on critical fields** (never auto-commit extracted values): plate number, policy number, accident date, IBAN/bank account, invoice amount, and *presence of* אישור אי-הגשת תביעה. Set a per-document-type accuracy KPI, not one global number.

> **Filling the "הודעה על תאונה" form is NOT an AI task — it's templating.** The forms are flat PDFs (no AcroForm) → fill via text overlay at coordinates, from **one canonical schema** + a **per-insurer coordinate template**. Tools: pdf-lib (Node) / reportlab + pypdf (Python), with an embedded Hebrew font. Details and field map: [form-field-map.md](form-field-map.md).

---

## 5. Security & privacy (from day one)
We collect sensitive PII (ID, license, third-party details) under Israel's Privacy Protection Law (חוק הגנת הפרטיות).

- **Client access** via a signed token with expiry — not a guessable `claim.id`.
- **Private Storage buckets** + **signed URLs** with short expiry for viewing.
- **Postgres RLS** — an agent sees only their agency's / their own claims.
- **Explicit consent** at the start of the flow, recorded in `claim_events` with a timestamp.
- **Encryption at rest** (Supabase default) + consider field-level encryption for ID numbers.
- **Least privilege** and a full audit log (`claim_events`).
- **Assessor independence:** the UI/automation must never appear to direct שמאות or steer garage/assessor choice — regulations forbid commission or benefit-in-kind in the claims process (רשות שוק ההון).
- **DPA** with every AI/OCR sub-processor (Anthropic named explicitly); documented **retention policy**; explicit **opt-in** for WhatsApp/digital messaging (required per כלל/general consent frameworks).
- **Client's right to export/receive their full claim file** on request — build an export path.

---

## 6. What's in MVP vs later
✅ **MVP:** collection web-app (RTL), basic dashboard, photo storage, AI summary + missing-info, **4-way classification label** (own-policy / TP-report / TP-settlement / unknown), "הודעה על תאונה" form fill, **static per-track checklist**.
⏭️ **After validation:** active task workflow (reminders, chasing garage/appraiser/insurer), WhatsApp Business API, document OCR, multi-agency / permissions, billing (Stripe), analytics, subrogation track.

---

## Links
- Lifecycle, user flow & state machine → [flow.md](flow.md)
- Claim types & per-track checklists → [claim-management.md](claim-management.md)
- Form field map → [form-field-map.md](form-field-map.md)
- MVP scope → [mvp-scope.md](mvp-scope.md)
- Assumption tracking → [assumptions-canvas.md](assumptions-canvas.md)
