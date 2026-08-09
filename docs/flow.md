# Flow — System Flow

> Companion to the visual diagrams. Details here: lifecycle, collection steps, state machine, edge cases.

---

## 0. Full lifecycle
```
report accident → collect documents → classify claim type → fill "הודעה על תאונה" form
                → per-track checklist → task engine manages per-track workflow (spawn/complete + status advance)
                → outbound queue proposes today's client chases for the agent to approve one tap at a time
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
Each step = one screen, one action. **Auto-save is client-local**: the current step + answers are written to `localStorage` per token (`web/src/lib/collection/persist.ts`, key `claim-wizard:v1:<token>`) on every change and restored after mount, so an interrupted client reopens `/c/[token]` where they left off. On restore, in-flight and failed uploads are dropped (completed ones already reached Storage) and the save is merged over the empty+prefill state, so a save written by an older deploy still loads. Cleared on successful submit. Nothing is persisted server-side before submit.

| # | What's collected | Input type | Notes |
|---|---|---|---|
| 1 | When & where the accident happened | date/time + location | GPS suggestion with manual confirm |
| 2 | Event description | free text **or voice recording** | voice → transcript → Claude structures it |
| 3 | Vehicle photos | photos (camera, gallery or file) | guided angles: front, back, side, damage close-up |
| 4 | Driver's license | photo | stored, **not sent to the LLM** in MVP |
| 5 | Vehicle registration | photo | same |
| — | Who was driving ("מי נהג") | choice + form | insured or someone else; if other, capture name/ID (+ optional license no. / relation) |
| 6 | Third-party details | form + photo (optional) | name, phone, ID, plate number, insurer |
| 7 | Police report / incident number | text (optional) | if relevant |
| 8 | Who's at fault ("מי אשם") | choice | me / third party / unknown — classification input |

> **Implemented:** on the vehicle step the client only types the **plate**; make/model ("יצרן ודגם") and production year are auto-filled from the **Ministry of Transport open-data registry** (`web/src/lib/vehicles/registry.ts`, via `GET /api/vehicle/[plate]` — proxied server-side, never called from the browser). The lookup is debounced (600 ms) and out-of-order responses are discarded. It **never overwrites what the client typed** — it writes only into an empty field or over a value this same mechanism filled earlier (a corrected plate), per the pure `mergeVehicleInfo`. A miss or any failure is a non-event: the fields stay manual ("לא מצאנו את הרכב במאגר — אפשר למלא ידנית"), and a hit is labelled as auto-filled and still editable. Not an OCR path — no personal data leaves the app, only the plate.

### Step 3 — AI processing
- Claude receives the **text/transcript + the list of uploaded documents** (not the ID images).
- Produces: a **structured event summary** + a **missing-info checklist** + narrative **signals** (`incident_kind`, `inferred_fault`). Claude does **not** pick the track — a deterministic classifier (`web/src/lib/claims/classify.ts`) turns those signals + the structured fields into a **proposed `claim_type`** with a confidence and, for third-party claims, a report-vs-settlement recommendation the agent must confirm. See [claim-management.md](claim-management.md).
- If critical info is missing → it surfaces as a **missing-info list** the agent chases (Step 5).

> **Implemented:** the analysis is **agent-side only**. It is computed lazily on the agent's first open of `/dashboard/[id]` (`getOrCreateAnalysis`, `web/src/lib/claims/analysis-cache.ts`) and cached in `summary_json.analysis`. The client wizard does **not** run it — the "סיכום חכם (AI)" panel was removed from the summary step, so a client is never shown a machine reading of their own accident. `POST /api/analyze` still exists as a stateless endpoint but has no in-app caller.

> **Implemented:** the wizard also captures the client's **own insurer** (`policy_insurer`) and **coverage type** (`insurance_type` — מקיף / חובה / צד ג', which pivots own-policy viability) on the identity step; the insurer selects the per-insurer form template. Both selects also offer **"לא בטוח/ה — הסוכן ישלים"** (value `unknown`), so an unsure client is never blocked from continuing: the raw answer stays in `summary_json.collected`, but `claims.policy_insurer` is stored as `null` (so no form is auto-filled at submit — the agent picks the insurer and regenerates later) and `insurance_type` is omitted from the canonical claim by `toClaimData`, exactly as an empty answer is. The identity step is **prefilled** from what the agent typed when creating the claim — `client_name` (naive first-word / rest split) into first/last name and `client_phone` into mobile; both stay editable. Photos / license / registration uploads persist to the private `claim-docs` Storage bucket via `POST /api/claims/documents` (magic-byte sniffed). The file pickers set **no `capture` attribute** — forcing it hides gallery + Files on iOS/Android — so the phone offers camera, gallery *and* the file browser; they accept `image/*,application/pdf`, matching the server sniff (JPEG / PNG / WebP / HEIC / PDF, `web/src/lib/files/sniff.ts`). This holds for both upload surfaces: the wizard's upload step and the post-submit follow-up upload screen (`FollowupUpload`, shown at `/c/[token]` once the claim is submitted).

### Step 4 — Confirm & submit
- The client sees a readable summary — one row per answer (שם · רכב · נהג · מתי · איפה · מה קרה · מי אשם · נפגעים · מסמכים) — confirms, and submits. **Tapping a row jumps straight back to the step that owns it** to fix the answer, instead of paging back through the wizard. The screen is deliberately client-facing only: no AI panel and no accident-notice preview (both are agent-side).
- The summary screen carries the **insured declaration**: a mandatory data-consent / information-transfer checkbox (captures the signatory name + signing date, and **gates the submit button**) plus, only when a third party is involved, an optional צד-ג' **power-of-attorney** consent (סעיף 68 לחוק חוזה הביטוח). These map into `declarations` on the canonical claim (`toClaimData`, `web/src/lib/collection/claim-state.ts`).
- Receives a confirmation message + (optional) a status-tracking link.
- **On submit** (`POST /api/claims/submit`), if a template exists for the client's insurer, the "הודעה על תאונה" form is filled **once** and stored in the case file (`generated_forms` + `form_generated` event). Best-effort — a fill error never blocks submission.

### Step 5 — At the agent
- The claim appears in the dashboard with status `submitted`. Opening it (`/dashboard/[id]`) is a **cockpit**: a hero (identity + status badge + days-open + AI one-liner), a **readiness strip** (the page's thesis — submittable or not; when blocking docs are missing it offers a **one-click WhatsApp chase** pre-filled with the client's upload link and the missing items **the client can actually supply** — the strip still lists everything blocking, but the message drops the system-generated form, agent-owned milestones and agent-drafted docs (מכתב דרישה), otherwise a button to advance the next milestone), the **proposed classification** (with confidence + rationale), the **uploaded documents** (signed-URL previews), the **pre-filled accident-notice form**, and an **agent notes** scratchpad (`claim_notes`, via `POST /api/claims/[id]/notes`).
- The agent **confirms/adjusts the claim type** (`PATCH /api/claims/[id]/classify` → advances to `classified`, or leaves it `unknown`) and works the **dynamic per-track checklist**: document items auto-check as files arrive (the agent uploads later docs via `POST /api/claims/[id]/documents` with a type tag), and milestone ticks persist via `PATCH /api/claims/[id]/checklist`. The agent can also regenerate / fill a different insurer's form on demand (which re-persists, replacing the prior copy per insurer), and can **edit/complete the canonical form fields** before regenerating (`PATCH /api/claims/[id]/form-data`) — the edits are stored in `summary_json.form_data`, the client's original `collected` submission is left untouched for audit, and the form fill prefers `form_data` when present (`effectiveClaimData`).

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
- `claim_type` (`own_policy` / `third_party_report` / `third_party_settlement` / `unknown`) — can start `unknown` and be revised; drives the per-track checklist and the task-engine rule track. See [claim-management.md](claim-management.md).

**Time/SLA dimension (cross-cutting):**
- `sla_clock_started_at` — set when all *blocking* required docs are present; `decision_due_at = +30 calendar days`; expect a 90-day continued-investigation notice if unresolved.
- `limitation_deadline` — per route: **3 years** (own policy, §31 חוק חוזה הביטוח) vs **7 years** (TP property damage as civil tort). Filing with the insurer does **not** toll this — only a court filing does.
- The dashboard surfaces "clock not started: missing X" and "decision due in N days" as first-class alerts.
- Full constants and citations: [regulatory-clock.md](regulatory-clock.md).

---

## 3. Edge cases (plan ahead)
- **Client abandons mid-way** → progress is saved in the browser (`localStorage`, per token) so reopening the link resumes; reminder after X hours (future: job); otherwise `abandoned`.
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

> **Implemented on the dashboard index:** the **morning brief** ("תדריך בוקר") triages every open claim, and below it the **outbound queue** ("יוצא היום") dispatches: lane 1 "לשלוח היום" is one row per due client chase with the rendered Hebrew message and a **[שלח בוואטסאפ]** / **[דלג]** pair; lane 2 "לטפל היום" lists every other due task plus "the client isn't answering — call them" escalations, linking into the cockpit. Nothing leaves without an agent tap, and both a send and a skip are recorded (`outbound_events`) — a skip suppresses the rule for its cooldown exactly like a send. The brief no longer carries its own chase button; sending happens in the queue (and the cockpit readiness strip, which now logs the same event). Panel hides when both lanes are empty or the read fails. See [architecture.md](architecture.md#3-data-model-initial-schema).
