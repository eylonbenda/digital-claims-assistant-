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
- If **yes** → show immediate emergency guidance (101 / police), and raise an **urgent flag** to the agent in real time (`urgent=true`). Collection continues, but the claim is marked for priority handling.
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
- Produces: a **structured event summary** + a **missing-info checklist** + a **proposed `claim_type`**.
- If critical info is missing → the client is asked to complete it before submitting.

> **Implemented:** the wizard also captures the client's **own insurer** (`policy_insurer`) on the identity step — this is what selects the per-insurer form template. Photos / license / registration uploads persist to the private `claim-docs` Storage bucket via `POST /api/claims/documents` (magic-byte sniffed).

### Step 4 — Confirm & submit
- The client sees a readable summary, confirms/edits, and submits.
- Receives a confirmation message + (optional) a status-tracking link.
- **On submit** (`POST /api/claims/submit`), if a template exists for the client's insurer, the "הודעה על תאונה" form is filled **once** and stored in the case file (`generated_forms` + `form_generated` event). Best-effort — a fill error never blocks submission.

### Step 5 — At the agent
- The claim appears in the dashboard with status `submitted`. Opening it (`/dashboard/[id]`) shows the **uploaded documents** (signed-URL previews) and the **pre-filled accident-notice form**.
- The agent **confirms/adjusts the claim type** (or leaves it `unknown`) and works the **per-track checklist**. The agent can also regenerate / fill a different insurer's form on demand (which re-persists, replacing the prior copy per insurer).

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
- `urgent` (injuries) — an attribute, not a state; affects sorting and color in the dashboard.
- `claim_type` (`own_policy` / `third_party_report` / `third_party_settlement` / `unknown`) — can start `unknown` and be revised; drives the per-track checklist (and the phase-2 task track). See [claim-management.md](claim-management.md).

---

## 3. Edge cases (plan ahead)
- **Client abandons mid-way** → save progress; reminder after X hours (future: job); otherwise `abandoned`.
- **Unreadable / missing photo** → basic validation (size/format), ask to re-shoot.
- **No third party** (single-vehicle) → skip step 6; default classification `own_policy`.
- **Route unclear** → classification stays `unknown`; the checklist shows shared docs until the agent decides.
- **Multiple vehicles / injured** → "add another" option for third parties.
- **Non-technical client** → fallback: the agent fills manually from the dashboard, or the client sends materials and the system organizes them.
- **Duplicates** → token per claim; warn the agent before opening a duplicate claim for the same event.

---

## 4. Agent flow (dashboard)
- **Claim list** sorted by status + urgency flag + claim type, with search.
- **Claim card:** client details, vehicle, documents/photos (view), AI summary, missing-info alerts, the generated "הודעה על תאונה" form, and a **static checklist by claim type** (required docs/steps + what's missing + next step). Active task automation is phase 2.
- **Create new claim:** agent enters client name + phone → system generates a personal link to send.
- **Alerts:** urgent flag (injuries), missing document, claim awaiting classification.
