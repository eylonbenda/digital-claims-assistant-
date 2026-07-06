# Flow — System Flow

> Companion to the visual diagrams. Details here: lifecycle, collection steps, state machine, edge cases.

---

## 0. Full lifecycle
```
report accident → collect documents → classify claim type → fill "הודעה על תאונה" form
                → static per-track checklist → (phase 2: manage tasks by type)
```
Collection (section 1) is the first half. Classification, form fill, and the per-track checklist are detailed in [claim-management.md](claim-management.md).

---

## 1. Client flow (claim collection)

The client gets a **personal link** from the agent (via WhatsApp) and opens an RTL Hebrew web-app on their phone.

### Step 0 — Entry & consent
- The link carries a **one-time, unguessable token** tied to the claim the agent created.
- Opening screen: "Hi, agent [name] asked to collect your accident details. This takes 3 minutes."
- **Explicit privacy consent** (checkbox + timestamp) before collecting any data.

### Step 1 — Triage (injuries)
- First question, always: **"Are there injuries?"**
- If **yes** → show immediate emergency guidance (101 / police) + raise an **urgent flag** (`urgent=true`). **Bodily injury (נפגעי גוף) is a different legal regime** (ביטוח חובה, not רכוש): the system handles the *רכוש* (property) part of the case, and **hands the גוף component to the agent** (out of MVP scope). This is a hard scope boundary, not just a color flag. Collection of the property side continues.
- If **no** → normal continuation.

### Step 2 — Guided collection (step-by-step, not one long form)
Each step = one screen, one action. Auto-save after each step (resumable).

| # | What's collected | Input type | Notes |
|---|---|---|---|
| 1 | When & where the accident happened | date/time + location | GPS suggestion with manual confirm |
| 2 | Event description | free text **or voice recording** | voice → transcript → Claude structures it |
| 3 | Vehicle photos | photos (camera) | guided angles: front, back, side, damage close-up |
| 4 | Driver's license | photo | stored, **not sent to the LLM** in MVP |
| 5 | Vehicle registration | photo | same |
| 6 | Third-party details | form + photo (optional) | name, phone, ID, plate number, insurer |
| 7 | Police report / incident number | text (optional) | if relevant |
| 8 | Who's at fault ("מי אשם") | choice | me / third party / unknown — classification input |

### Step 3 — AI processing
- Claude receives the **text/transcript + the list of uploaded documents** (not the ID images).
- Produces: a **structured event summary** + a **missing-info checklist** + narrative **signals** (`incident_kind`, `inferred_fault`). Claude does **not** pick the track — a deterministic classifier (`web/src/lib/claims/classify.ts`) turns those signals + the structured fields into a **proposed `claim_type`** with a confidence and, for third-party claims, a report-vs-settlement recommendation the agent must confirm. See [claim-management.md](claim-management.md).
- If critical info is missing → the client is asked to complete it before submitting.

> **Implemented:** the wizard also captures the client's **own insurer** (`policy_insurer`) and **coverage type** (`insurance_type` — מקיף / חובה / צד ג', which pivots own-policy viability) on the identity step; the insurer selects the per-insurer form template. Photos / license / registration uploads persist to the private `claim-docs` Storage bucket via `POST /api/claims/documents` (magic-byte sniffed).

### Step 4 — Confirm & submit
- The client sees a readable summary, confirms/edits, and submits.
- Receives a confirmation message + (optional) a status-tracking link.
- **On submit** (`POST /api/claims/submit`), if a template exists for the client's insurer, the "הודעה על תאונה" form is filled **once** and stored in the case file (`generated_forms` + `form_generated` event). Best-effort — a fill error never blocks submission.

### Step 5 — At the agent
- The claim appears in the dashboard with status `submitted`. Opening it (`/dashboard/[id]`) is a **cockpit**: a hero (identity + status badge + days-open + AI one-liner), a **readiness strip** (the page's thesis — submittable or not; when blocking docs are missing it offers a **one-click WhatsApp chase** pre-filled with the missing items + the client's upload link, otherwise a button to advance the next milestone), the **proposed classification** (with confidence + rationale), the **uploaded documents** (signed-URL previews), the **pre-filled accident-notice form**, and an **agent notes** scratchpad (`claim_notes`, via `POST /api/claims/[id]/notes`).
- The agent **confirms/adjusts the claim type** (`PATCH /api/claims/[id]/classify` → advances to `classified`, or leaves it `unknown`) — for third-party claims the report-vs-settlement pick is presented as a **side-by-side decision aid** (pros/cons per track, with the system's recommendation flagged) — and works the **dynamic per-track checklist**: document items auto-check as files arrive (the agent uploads later docs via `POST /api/claims/[id]/documents` with a type tag), and milestone ticks persist via `PATCH /api/claims/[id]/checklist`. The panel shows a **progress meter** over the required items, and each satisfied document item **links to the uploaded file** (signed URL). Ticking a **submit** milestone advances `claim.status` to `submitted`, and ticking **payment received** advances it to `closed` (forward-only — unticking never downgrades; sets `submitted_at` / `closed_at`). The agent can also regenerate / fill a different insurer's form on demand (which re-persists, replacing the prior copy per insurer), and can **edit/complete the canonical form fields** before regenerating (`PATCH /api/claims/[id]/form-data`) — the editor runs **inline validation** (ת"ז checksum, plate 7–8 digits, phone, no future dates) and offers a one-click regenerate after save; the edits are stored in `summary_json.form_data`, the client's original `collected` submission is left untouched for audit, and the form fill prefers `form_data` when present (`effectiveClaimData`).

---

## 2. Claim state machine

Collection is the first half. After `submitted`, the management phase begins, branching by **claim type**.

```
created → in_progress → submitted → classified → form_generated → checklist_active → … → closed
              │                          │
        (abandon) → abandoned       claim_type:  own_policy | third_party_report |
                                                 third_party_settlement | unknown
```

| State | Meaning | Driven by |
|---|---|---|
| `created` | link created, client hasn't entered yet | system |
| `in_progress` | client mid-collection | client |
| `submitted` | client finished and submitted | client |
| `classified` | claim type set: own-policy / TP-report / TP-settlement / unknown | AI proposes + agent confirms |
| `form_generated` | "הודעה על תאונה" form filled | system |
| `checklist_active` | per-track checklist shown; agent works it | agent |
| `closed` | done | agent |
| `abandoned` | started but never finished (timeout) | system |

**Phase-2 handling sub-states** (active workflow): `claim_opened`, `in_handling`, `pending_documents`, `pending_assessor`, `pending_payment`, and the granular `WAITING_FOR_*` statuses (garage invoice, appraiser report, no-claim confirmation, insurance history).

**Cross-cutting dimensions:**
- `urgent` (injuries) — an attribute, not a state; affects sorting and color in the dashboard. Also triggers the גוף/רכוש scope split (see Step 1).
- `claim_type` (`own_policy` / `third_party_report` / `third_party_settlement` / `unknown`) — can start `unknown` and be revised; drives the per-track checklist (and the phase-2 task track). See [claim-management.md](claim-management.md).

**Time/SLA dimension (cross-cutting):**
- `sla_clock_started_at` — set when all *blocking* required docs are present; `decision_due_at = +30 calendar days`; expect a 90-day continued-investigation notice if unresolved.
- `limitation_deadline` — per route: **3 years** (own policy, §31 חוק חוזה הביטוח) vs **7 years** (TP property damage as civil tort). Filing with the insurer does **not** toll this — only a court filing does.
- The dashboard surfaces "clock not started: missing X" and "decision due in N days" as first-class alerts.
- Full constants and citations: [regulatory-clock.md](regulatory-clock.md).

---

## 3. Edge cases (plan ahead)
- **Client abandons mid-way** → save progress; reminder after X hours (future: job); otherwise `abandoned`.
- **Unreadable / missing photo** → basic validation (size/format), ask to re-shoot.
- **No third party** (single-vehicle) → skip step 6; default classification `own_policy`.
- **Route unclear** → classification stays `unknown`; the checklist shows shared docs until the agent decides.
- **Multiple vehicles / injured** → "add another" option for third parties.
- **Non-technical client** → fallback: the agent fills manually from the dashboard, or the client sends materials and the system organizes them.
- **Duplicates** → token per claim; warn the agent before opening a duplicate claim for the same event.
- **Theft / vandalism** → set `theft=true`; checklist requires police report + keys. Classification `own_policy`.
- **Lien on vehicle** → set `lien=true`; lien-release document required before payout is processed.
- **Business client** → set `business_use=true`; accountant VAT-offset confirmation required.
- **"נבחרת מוסכים" rider** → set `garage_network_rider=true`; warn prominently that out-of-network repair may void תגמולים.
- **Repair outside insurer network** (without a מוסך הסדר pre-authorisation) → checklist flags need for a pre-repair estimate (duty to mitigate; without it the insurer may dispute the invoice).
- **Client already activated own policy, third party at fault** → set `policy_activated=true`; fork `third_party_report` to residual-loss (הפסדים) — requires `loss_confirmation` instead of `no_claim_confirmation`.

---

## 4. Agent flow (dashboard) — three screens

- **Inbox ("what's stuck")** — grouped first by *blocking dependency*, then *regulatory clock*, not by insurer or date. Mental model = task tickets: *missing license / awaiting אישור אי-הגשה / awaiting invoice / awaiting קבלה / clock not started / decision due in N days / approved for settlement / paid / requires continued investigation (המשך בירור)*. Search + filter by `claim_type`, urgency.
- **Claim 360** — client/vehicle/3rd-party details, document list + previews, AI summary, an **event Timeline** (from `claim_events`), the generated הודעה-על-תאונה form, the per-track conditional checklist (mandatory/conditional/blocking semantics), a **regulatory-clock widget** (clock started/not + days to decision), and an explicit **Next action**.
- **Templates/Exports** — accident notice (done) + demand letter + submission packet (see `generated_forms.kind` in [architecture.md](architecture.md)).
- **Create new claim:** agent enters client name + phone → personal link to send.
- **Alerts:** urgent flag (injuries), blocking dependency missing, claim awaiting classification, regulatory clock approaching decision date.
