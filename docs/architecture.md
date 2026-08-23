# Architecture

> Companion to the visual architecture diagram. Details here: components, data model, AI design, security/privacy.

---

## 1. Overview
- **Frontend + Backend:** Next.js (App Router) + TypeScript, on Vercel. Three surfaces:
  1. **Marketing landing page** at `/` (public, static, Hebrew/RTL — `web/src/app/page.tsx`, "OpenTik") — the prospect. Links to `/login`; wa.me demo CTA.
  2. **Collection web-app** (public, no login, access via signed token) — the client.
  3. **Agent dashboard** (authenticated) — the agent.
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
                 due_at, assignee, created_at,
                 key, source, note, completed_at)   -- task-engine cols (migration 006)
                 -- track: own_policy | third_party_report | third_party_settlement
                 -- status: todo | in_progress | blocked | done
                 -- key: stable template id (null = manual task, never auto-completed)
                 -- source: template (engine-spawned) | manual (agent-created)
                 -- partial unique index: at most one OPEN template task per (claim, key)
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
agent_briefs    (agent_id → agents, brief_date, payload_json, created_at)
                 -- cached morning-brief AI *ranking* only (tier/reason/flags per claim),
                 --   one row per agent per UTC day (migration 007). The action fields
                 --   (blocking docs, next task) are recomputed live on read, never cached.
                 --   RLS: agent reads own, writes service-only
outbound_events (id, claim_id → claims, task_id → tasks (on delete set null),
                 task_key, recipient_kind, channel, kind, body_snapshot,
                 actor, created_at)
                 -- append-only log of outbound-queue decisions (migration 008).
                 --   kind: sent | skipped   ·   actor: agent | system
                 --   recipient_kind: client · channel: whatsapp (C1 values)
                 --   body_snapshot: audit copy of what went out (kind='sent' only)
                 --   kind='sent' = "the agent tapped the wa.me link", NOT "delivered" —
                 --     wa.me reports nothing back. Must become a real delivery record
                 --     (BSP receipts) before any rule flips to auto-send.
                 --   index (claim_id, task_key, created_at desc) serves the cooldown read
                 --   RLS: agent reads own via claim_belongs_to_me, writes service-only
collection_progress  -- can live as JSON on claims or as a separate table
```

Notes:
- **Where the schema lives:** `web/db/schema.sql` is the fresh-install snapshot and folds in migrations `004`–`008` in full: expanded `doc_type` + circumstance flags (`004`), `claim_notes` (`005`), the task-engine columns on `tasks` plus `tasks_claim_key_open_uniq` (`006`), `agent_briefs` (`007`), and `outbound_events` (`008`), including every RLS policy. Only `001` (agent trigger on `auth.users`) and `003` (Storage bucket) must still be applied separately — they touch objects outside the `public` schema. **Nothing applies migrations automatically**: deploying does not touch the database, so each one is pasted into the Supabase SQL editor by hand. A skipped migration fails at runtime and often silently — missing `007` on prod made the morning brief re-run its LLM ranking on every dashboard load.
- `access_token` — non-sequential identifier for client access (never expose `claims.id`).
- `summary_json` — the client's `collected` submission + Claude's structured output (`analysis`: summary + missing-info checklist). When the agent edits/completes the accident-notice fields, the corrected canonical `ClaimData` is stored alongside as `form_data` (`effectiveClaimData` prefers it over `collected`; the original `collected` is never mutated, for audit). Before submit the same column also holds `draft` — the wizard's in-progress `{ step_key, collected, saved_at }`, merged in by `POST /api/claims/draft` (see §5) and dropped when submit overwrites `summary_json` with `{ collected }`.
- **Per-track checklist** (implemented — `web/src/lib/claims/checklist.ts`) = a per-track config (`claim_type` → required docs/steps, grouped into `base` / `late` / `conditional` / `milestone` sections) ⊕ a presence check against `claim_documents` / collected fields. `computeChecklist()` is a pure function, run server-side on the claim detail page — a **derived view**, distinct from the task engine (below), which reads this checklist to decide what work to spawn.
- **Task engine** (implemented — `web/src/lib/tasks/`) = the active workflow layer over the `tasks` table. A **pure, idempotent** decision function `advanceTasks()` (`engine.ts`) takes the computed checklist + open tasks + an `EngineEvent` (`claim_submitted` / `track_confirmed` / `milestone_ticked` / `doc_uploaded`) and returns `{ spawn, complete, statusAdvance }` from a declarative per-track rule table (`templates.ts`: spawn-on / complete-when conditions, relative due-date offsets sourced from [regulatory-clock.md](regulatory-clock.md)). `runner.ts` (`runEngine`) fetches state → runs the pure fn → applies inserts/updates, and is called **best-effort** (never fails the triggering mutation) inline from the submit / classify / checklist / documents routes. Status advances are forward-only (`STATUS_ORDER`) and compare-and-set. Agents also add ad-hoc tasks (`source='manual'`, never auto-completed) via `POST /api/claims/[id]/tasks` and edit them via `PATCH /api/claims/[id]/tasks/[taskId]`; surfaced on `/dashboard/[id]` (`TasksPanel`) and folded into the dashboard index cards (below). The dashboard **index** additionally computes a **morning brief** ("תדריך בוקר" — `web/src/lib/brief/`): an AI-tiered triage of all open claims. It no longer has a panel of its own — since the one-list redesign it is a *data source* for the composed card list. Per claim, `facts.ts` builds a fact sheet + `score.ts` a deterministic priority score (hard signals only: overdue tasks, blocking docs, staleness, urgent/unclassified); `rank.ts` sends the sheets to Claude (`json_schema` output) for a per-claim **tier** (`act_now`/`this_week`/`waiting`/`ok`) + one Hebrew reason + soft `flags`, with `sanitizeSignals` gating the output and `fallbackTier` giving a rules-only tiering when AI is unavailable. `brief.ts` (`getOrCreateBrief`) is best-effort and splits what it caches from what it recomputes: **only the AI ranking** is cached per agent per UTC day (`agent_briefs`, never persisting a degraded AI-unavailable ranking), while the **deterministic action fields — blocking docs and next task — are rebuilt live on every read**, so a document uploaded after the ranking ran can't leave a stale one-click chase (and a claim closed since then drops out). Returns `null` on any failure so the dashboard still renders. `POST /api/brief/refresh` recomputes.
  - Document items **auto-check** from `claim_documents` presence — uploaded at intake, or **by the agent from the dashboard with a type tag** (`POST /api/claims/[id]/documents`; MVP = Option A; a follow-up client/garage upload link is phase 2).
  - Conditional items (police report / keys / lien release / VAT offset / loss-vs-no-claim confirmation) are driven by the claim's **circumstance flags** (`theft`, `lien`, `business_use`, `policy_activated`, `garage_network_rider`). The flag gates whether an item **blocks**, not whether it is listed: a `requiresFlag` on the item def forces `blocking: false` while the flag is off, so a plain own-policy collision is never held up by a police report or lien release its facts never called for — the item still renders, since the agent may know it applies. `policy_activated` is the one true swap (`loss_confirmation` replaces `no_claim_confirmation` in the list). Blocking state feeds the cockpit's next action + tab badges, the brief's blocking-doc count/score, and the task engine's `blockingMissing`, so narrowing it here narrows all three.
  - Late payment-stage docs can be `mandatory` without being `blocking` when they cannot arrive until the file is otherwise complete: in `third_party_report` the payment receipt (`repair_receipt`) is still required for the file but no longer gates readiness — it follows the invoice, and the original invoice (`garage_invoice`) still blocks — so an otherwise-ready claim isn't parked at "not submittable" waiting for it.
  - Pure action-milestones (e.g. "submitted to insurer", "car at garage", "payment received") are **manual ticks** (`PATCH /api/claims/[id]/checklist`), persisted in a small `checklist_state` JSON on `claims`.
  - **Not everything blocking is something the client can send.** An item def carries an optional `clientSuppliable` (absent = true, set `false` on agent-produced docs — currently `demand_form`, the מכתב דרישה the agent drafts), and `chaseableLabels()` filters a blocking list down to `kind='doc'` items the client can actually supply before it reaches a WhatsApp chase body — so a chase never asks for a system-generated form (`kind='form'`), an agent-owned milestone, or a letter only the agent's side can produce. `appraiser_report` stays client-suppliable on purpose: on `third_party_report` the client commissions and holds the private appraiser's report. The cockpit still *lists* everything blocking; only the outgoing message is filtered. Shared by the cockpit header and the outbound queue so both chase surfaces stay in sync.
- **Outbound queue** (implemented — `web/src/lib/outbound/`; phase-2 step C1) = the **dispatch** layer, where the brief is **triage**: the brief says which claims matter, the queue says what leaves the building today. The brief therefore no longer carries a chase button — the queue (and the cockpit header) are the only places anything is sent. Pure `buildQueue` (`queue.ts`) takes today's due, **open `source='template'`** tasks and splits two lanes: `send` — the three client-directed keys (`chase_missing_docs`, `get_tp_insurer`, `collect_private_report_docs`), each body rendered **live** by a deterministic Hebrew builder in `web/src/lib/wa.ts` (no LLM in the send loop) into a one-tap `wa.me` link — and `doToday`, every other due task plus escalation rows. Three guards: a per-rule cooldown in which a `skipped` event suppresses exactly like a `sent` one; **one message per claim per UTC day** (most-overdue wins, ties by `RULE_PRIORITY`); and give-up — after `MAX_SENDS_BEFORE_CALL` (3) sends with no document arriving since, the row stops being proposed and becomes a "call them" escalation in `doToday`. **Only decisions are persisted** (`outbound_events` via `POST /api/outbound/events`); what is *proposable* is derived on every read, so the queue cannot go stale, and a completed task simply drops out. `rules.ts` carries `auto: boolean` — always `false` in C1 — as the seam for a later cron sender writing the same rows with `actor='system'`. `load.ts` is best-effort like `brief.ts` with one deliberate difference: a failed `outbound_events` read returns `null` (no sends proposed at all) rather than degrading to "no events", which would propose sends with no cooldown data and double-chase a client. `SendItem` also carries two **presentation-only** fields the queue's own logic never reads — `doc_labels` (from the rule's `labels()`, deliberately separate from the message `build()` so a rule can display a different label set than it sends) and `last_sent_at` — so a dashboard card can name what's being waited on and when the last reminder went out.
- **Dashboard composition** (implemented — `web/src/lib/dashboard/` → `TodayList`) = the index's view model, layered over brief + queue + tasks rather than beside them. The separate "תדריך בוקר" and "יוצא היום" panels were **replaced by one list**: pure `composeDashboard` (`compose.ts`) merges claims ⊕ queue ⊕ brief ⊕ open tasks into exactly **one `ClaimCard` per open claim** and splits it into three sections — `attention` (a due client message, a due task, an unclassified submitted claim, or brief tier `act_now`), `waiting` (a future-dated task, tier `waiting`/`this_week`, or a claim the client hasn't submitted yet), `ok` (everything else). Each card gets one primary `action_line` — client message wins, else the most-overdue do-task, else the classification prompt, else the waiting line — and whatever lost that slot becomes a single `וגם:` line, so nothing duplicates across panels the way the two-panel layout did. Ordering: attention by brief tier → score → overdue days; waiting by nearest future due date; ok alphabetical by client name. All user-visible Hebrew comes from the pure `copy.ts` language layer. Both modules are unit-tested; `TodayList.tsx` owns the send/skip handlers moved out of the deleted `OutboundQueue.tsx` (same `POST /api/outbound/events` contract, same synchronous-`window.open` trap). `ClaimsTable.tsx` slimmed to a **searchable archive table** (name/phone search, closed-claims toggle) below the list.
- **Cockpit composition** (implemented — `web/src/lib/cockpit/` → `CockpitTabs` / `CockpitHeader`) = the same "one thing to do" discipline applied to the claim-detail page. Pure `deriveCockpit` (`derive.ts`) takes the data the page already loaded — checklist blocking items, chaseable labels, tasks, the analysis' missing-field list, generated forms, next milestone, doc count — and returns **one** `NextAction` by fixed precedence (confirm track → chase the client → most urgent open task → missing form fields → advance milestone → form ready / fill the form → nothing open) plus per-tab badge counts. No I/O and no clock read (the caller passes `now`), so it is unit-testable and stays consistent with the checklist it derives from; `copy.ts` is its Hebrew language layer, reusing `dashboard/copy.ts` idioms (`doActionLine`, `joinHe`) so the index and the cockpit phrase the same work the same way. The `NextAction` variant also names the **target tab**, which is how a secondary action stays one tap away without duplicating panels.
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
- **Draft state, two copies:** the collection wizard mirrors in-progress answers (name, ID number, phone, licence number) into the device's own `localStorage`, keyed per token, so an interrupted client can resume (`web/src/lib/collection/persist.ts`). It is cleared on successful submit — an abandoned claim leaves the draft on the device. The same answers are **also synced server-side** into `claims.summary_json.draft` (`POST /api/claims/draft`, token-authenticated via the service client) so a client who switches browser or device resumes too. That sync is **gated on the consent step** — merely opening the link writes nothing — and the server copy therefore falls under the same retention/erasure duty as a submitted claim: an abandoned claim now leaves PII in the database, not only on the phone. Submit clears it by overwriting `summary_json`; an abandoned draft is **not** yet expired by any job.
- **Outbound plate lookup:** the vehicle registry call (data.gov.il, `web/src/lib/vehicles/registry.ts`) goes out **server-side only** (`GET /api/vehicle/[plate]`) — the claimant's IP never reaches the government endpoint, and the only value sent is the plate, which carries no owner identity in that dataset. One egress point to cache or swap.
- **Encryption at rest** (Supabase default) + consider field-level encryption for ID numbers.
- **Least privilege** and a full audit log (`claim_events`).
- **Assessor independence:** the UI/automation must never appear to direct שמאות or steer garage/assessor choice — regulations forbid commission or benefit-in-kind in the claims process (רשות שוק ההון).
- **DPA** with every AI/OCR sub-processor (Anthropic named explicitly); documented **retention policy**; explicit **opt-in** for WhatsApp/digital messaging (required per כלל/general consent frameworks).
- **Client's right to export/receive their full claim file** on request — build an export path.

---

## 6. What's in MVP vs later
✅ **MVP:** collection web-app (RTL), basic dashboard, photo storage, AI summary + missing-info, **4-way classification label** (own-policy / TP-report / TP-settlement / unknown), "הודעה על תאונה" form fill, **per-track checklist**, **task engine** (event-driven task spawn/complete + forward-only status advance; pulled forward from phase 2).
⏭️ **After validation:** WhatsApp Business API, document OCR, multi-agency / permissions, billing (Stripe), analytics, subrogation track. Client chasing now exists as an **agent-approved outbound queue** (phase-2 step C1, above); still to build: unattended auto-send (cron + a BSP channel with real delivery receipts, gated on per-rule skip rates from `outbound_events`) and outbound chasing of the garage / appraiser / insurer, for whom no contact fields exist in the schema yet.

---

## Links
- Lifecycle, user flow & state machine → [flow.md](flow.md)
- Claim types & per-track checklists → [claim-management.md](claim-management.md)
- Form field map → [form-field-map.md](form-field-map.md)
- MVP scope → [mvp-scope.md](mvp-scope.md)
- Assumption tracking → [assumptions-canvas.md](assumptions-canvas.md)
