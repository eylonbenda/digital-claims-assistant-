# Our side: Digital Claims Assistant / OpenTik (עוזר התביעות הדיגיטלי), as of 2026-10-16

> Sources: the repo itself at `main` @ `886774e` (last merged PR #84, 2026-10-09). Links point to `https://github.com/eylonbenda/digital-claims-assistant-/blob/main/<path>`; the path alone is enough to find each source. "BUILT" means I checked it in the code. "DOC" means it is only in docs or spec. Public brand on the landing page: **OpenTik** (opentik.co.il).

## 1. Target customer and stage

### Takeaway
This is a validation-stage product with exactly **one paying-candidate customer, a garage (מוסך)**. That garage has been a free pilot since 2026-07-19, with **50+ real claims** since mid-August. The ICP (ideal customer profile) is deliberately both insurance agents and garages, but **no insurance agent has used it**. The buyer (the garage owner) is not the user (an employee, a פקידה). Willingness to pay (B1) is still **unvalidated**.

### Cited Findings
- The ICP covers insurance agents and garages. Customer zero is a garage, chosen because it was the warm contact. In the code, `agents`/`agent_id` means "the business handling the claim" — [CLAUDE.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/CLAUDE.md)
- Pilot snapshot (2026-09-27): 1 active customer (a garage), zero insurance agents, 50+ real claims since mid-August (~6 weeks). What actually runs in production: the client gets a link, fills it in alone, and the system produces the accident-notice form for the garage — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)
- The pilot validated **intake + form generation** (V1, V5, C1 ✅). It did **not** validate post-intake claim management (V6, V3, V4ב, V7 ⬜). The task engine, cockpit and outbound queue were "built in full before testing" and the customer has not seen them — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)
- Expanding to more customers was planned for 2026-09-11 and did not happen. The recommendation is that the next customer be another garage (V8א repeatability); the cross-segment question (V8ב, garage → agent) is untested — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)
- The landing page title still reads "OpenTik — עוזר התביעות הדיגיטלי לסוכני ביטוח" (pitched at insurance agents), with a wa.me demo CTA (call-to-action) and an agent login at "כניסת סוכנים" — [web/src/app/page.tsx](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/app/page.tsx)
- Success metrics: 1/3 agents with specific pain; 1 design partner ✅; "how much would they pay per month" not tested after ~10 weeks — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)

### Inferences
- Against ClaimAI, the honest framing is "a working pilot with one garage, pre-revenue", not an established product. Any claim about agent-side fit is still an assumption.

### Gaps
- Whether the owner pricing conversation (scheduled for the week of 2026-09-29 / 2026-10-05) happened, and its outcome, is not recorded in the repo. The price cells in `validation-guide.md` are still `___ ₪`.

## 2. Client-side collection flow

### Takeaway
BUILT: a **mobile web link** (`/c/[token]`) that the business sends over WhatsApp using `wa.me` (no WhatsApp Business API/BSP). It opens a tap-first Hebrew RTL wizard of 13 steps in 4 chapters. The wizard is resumable on the same device and across devices, auto-fills the car from the plate through the Ministry of Transport open-data registry, and requires uploads of the driver's licence (both sides) and the vehicle registration, with a "send later" escape.

### Cited Findings
- Channel: the business creates the claim and sends a personal link via "שלח בוואטסאפ" (wa.me deep link to the client's number). WhatsApp is the *distribution* channel; collection happens in the web link. The WhatsApp Business API is deferred — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #51), [docs/mvp-scope.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/mvp-scope.md), [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md) (C4, T2)
- BUILT steps, declared in `steps.ts`: intro/consent → quick chapter (injuries, who was driving, fault "מי אשם", third party present; one tap answers and auto-advances) → details (vehicle, insured, driver details if the driver was not the insured, third-party details if relevant, when/where, description) → documents → summary — [web/src/components/collection/steps.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/components/collection/steps.ts)
- Documents collected in the wizard: driver's licence (both sides, `min: 2`, of whoever actually drove), vehicle registration (both required, or explicitly deferred with "אשלח בהמשך"), and car/damage photos. Uploads go to a private Supabase Storage bucket, with magic-byte sniffing and client-side compression, from gallery, Files or camera — [web/src/components/collection/steps/DocumentsStep.tsx](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/components/collection/steps/DocumentsStep.tsx), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #62, #66)
- Plate lookup: the vehicle step auto-fills make/model and year from the Ministry of Transport open-data registry ("רכב פרטי ומסחרי", data.gov.il) through a server-side proxy `GET /api/vehicle/[plate]`. A miss is a non-event — [web/src/lib/vehicles/registry.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/vehicles/registry.ts), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #37)
- Location assist: "המיקום הנוכחי שלי" reverse-geocodes GPS through OSM Nominatim — [web/src/lib/geo/reverse.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/geo/reverse.ts)
- Third-party step: name, phone, plate, and the third party's insurer (a select list or free text). A hit-and-run escape ("אין לי את פרטי הצד השני") and a parked-car option ("אף אחד — הרכב היה חנוי") came from pilot feedback — [web/src/components/collection/steps/TpDetailsStep.tsx](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/components/collection/steps/TpDetailsStep.tsx), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #50)
- An unknown own insurer or coverage is allowed ("לא בטוח/ה — יושלם בהמשך"). Name and phone are pre-filled from the business's record — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #31)
- An insured declaration (data consent + optional third-party power of attorney) gates submit. The summary screen allows tap-to-edit on each row. Client copy names the actual handling business ("הפרטים נשלחו למוסך כהן"), not "the agent" — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #33, #70)
- Resumability: `localStorage` per token, plus a server-synced draft in `summary_json.draft` (debounced 1.2 s, consent-gated) — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #30, #52)
- Funnel analytics: `GET /api/reports/funnel` returns links sent, completion rate, the step where clients abandon, and deferral counts — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #62)
- A follow-up upload page lets the client send late documents through the same link (`FollowupUpload.tsx`) — [web/src/components/collection/](https://github.com/eylonbenda/digital-claims-assistant-/tree/main/web/src/components/collection)
- The client never sees AI output. The AI summary and the form preview were removed from the client summary screen — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #33)

### Inferences
- There is no conversational AI chatbot on the client side. It is a structured form wizard. If ClaimAI offers an AI chat or voice intake, that is a real difference in UX approach. Our side argues for deterministic, tap-first input.

### Gaps
- No OCR or extraction of the licence or registration (the plate lookup is the only auto-fill). The abandonment rate has not been measured in production (C1 remainder).

## 3. AI features actually implemented

### Takeaway
BUILT: (a) a per-claim **Claude analysis** (Hebrew summary, list of missing info, incident kind, fault inferred from the narrative), feeding (b) a **deterministic two-layer classifier**; and (c) an AI **morning-brief ranking**, which is built but **turned off by default** since PR #61. Doc validation (vision) is **spec only**. The AI is narrow and gated: the LLM never picks the track and never sends messages, and the form fill uses no AI at all.

### Cited Findings
- `analyze.ts` produces JSON-schema output with `summary` (Hebrew), `missing[]`, `incident_kind`, `inferred_fault` and `fault_note`. The prompt tells the model to infer fault from the description only, ignoring what the client ticked — [web/src/lib/ai/analyze.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/ai/analyze.ts)
- Model: `CLAIMS_MODEL = process.env.CLAIMS_AI_MODEL ?? "claude-opus-4-8"`. The client has a 120 s timeout and 1 retry — [web/src/lib/anthropic.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/anthropic.ts), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #57)
- Two-layer classification: the LLM emits signals only, and the deterministic `classify.ts` owns the track, confidence, report-vs-settlement recommendation, fault-mismatch warning and viability warning ("אזהרת מימוש"). The AI proposes and the business confirms — [web/src/lib/claims/classify.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/claims/classify.ts), [docs/claim-management.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/claim-management.md)
- The analysis is cached in `summary_json.analysis` with an input hash and warmed off-render (at submit, and via `after()`). The cockpit never waits on the model — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #77)
- Morning brief: per-claim fact sheet → deterministic score → Claude tiering (`act_now`/`this_week`/`waiting`/`ok`) with a Hebrew reason. `sanitizeSignals` gates the output, with a rules-only fallback, and the prompt carries no phone number and no token. It sits **behind `BRIEF_ENABLED=1`; off by default** since 2026-09-27, because the operator's day is intake → form → send, not triage — [web/src/lib/brief/](https://github.com/eylonbenda/digital-claims-assistant-/tree/main/web/src/lib/brief), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #61)
- AI document validation ("is this actually a driver's licence?", vision): "Status: spec / not built" — [docs/ai-doc-validation.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/ai-doc-validation.md)
- Measured AI cost: ~$0.04 per claim (one cached `analyze` call) ≈ ₪6/month at current volume. Form generation is pdf-lib with no AI — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md) (B2)
- AI quality is unmeasured (T3/T4 ⬜). It is gated by design; 50 business-confirmed classifications exist as ground truth but have not been queried — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)
- Known weak spot: `analyze.ts` sends the full `ClaimData` (ID, DOB, licence, bank) to Anthropic even though the prompt only needs the narrative (finding 0930-11, proposed and not fixed) — [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md)

### Inferences
- If ClaimAI markets "AI" heavily (damage assessment from photos, OCR, chat), our AI surface is smaller. Our differentiation is workflow plus form coverage, not AI depth.

### Gaps
- No damage estimation from photos, no OCR, no AI-written outbound messages (the message bodies are deterministic Hebrew templates).

## 4. Business-side features (dashboard, cockpit, tasks, outbound, PDF forms)

### Takeaway
BUILT: a one-list dashboard, a 4-tab claim cockpit with one derived "next action", a per-track dynamic checklist, an event-driven task engine with due dates, an **outbound queue the business approves one tap at a time** for WhatsApp chases to the client, and **automatic filling of the "הודעה על תאונה" PDF for 11 insurers**. The regulatory SLA clock and limitation deadlines are **documented but not built**.

### Cited Findings
- Dashboard `/dashboard`: one card per open claim, ordered by latest activity, with "חדש"/"מסמך חדש" badges, refresh on focus, pagination, a stalled-claimant line ("הלקוח הגיע עד <שלב> ולא סיים") and a searchable archive table — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #43, #81, #82, #84)
- Cockpit `/dashboard/[id]`: a header with status, days open, the AI one-liner and one derived next action (e.g. a one-click WhatsApp document chase pre-filled with the missing items and the upload link). Tabs: סקירה (classification and notes) / עבודה על התיק (tasks, checklist, business-side doc upload) / טופס ההודעה (generated form, regenerate, field editor) / קבצים — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #46), [web/src/lib/cockpit/derive.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/cockpit/derive.ts)
- Checklist: per track, with base / late / conditional / milestone sections. Document items tick automatically from uploads; milestones are ticked by hand and dated in `claim_events`. Circumstance flags (theft, lien, business use, policy activated, garage-network rider) drive the conditional items — [web/src/lib/claims/checklist.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/claims/checklist.ts), [docs/claim-management.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/claim-management.md)
- Task engine: a declarative per-track rule table with due offsets (e.g. `finish_wizard` 1d, `chase_missing_docs` 3d, `open_claim_with_insurer` 2d, `follow_up_insurer` 14d, `get_tp_insurer` 2d, `collect_private_report_docs` 5d, `request_settlement_approval` 2d). Offsets are "FIELD ASSUMPTIONS … not regulated SLAs". Manual tasks are also supported — [web/src/lib/tasks/templates.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/tasks/templates.ts)
- Outbound: rules `finish_wizard`, `chase_missing_docs`, `get_tp_insurer`, `collect_private_report_docs`. Each is a one-tap `wa.me` send or a skip, logged in `outbound_events`, with per-rule cooldowns, one message per claim per day, and escalation to "call the client" after 3 sends with no response. `auto: false` on every rule: **no unattended auto-send**, and **no chasing of the garage, appraiser or insurer** (no contact fields in the schema) — [web/src/lib/outbound/rules.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/outbound/rules.ts), [web/src/lib/wa.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/wa.ts), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #39)
- PDF form fill: the canonical claim schema is overlaid by coordinates onto flat insurer PDFs (pdf-lib + fontkit, Noto Sans Hebrew). It fills automatically at submit from the client's insurer, and the business can regenerate it or edit the fields (`FormFieldEditor`). **11 templates**: AIG, איילון, כלל, הכשרה, הראל, ליברה, מנורה, מגדל, הפניקס, שלמה, שומרה — [web/src/lib/formfill/templates/](https://github.com/eylonbenda/digital-claims-assistant-/tree/main/web/src/lib/formfill/templates), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (step 5, PR #40, #53, #55)
- Form QA caveat: there are no automated tests over the 11 templates, and a form-fill failure at submit is swallowed (0930-15). Render QA examples are stale for several insurers; the הפניקס rework was not render-verified in the PR — [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md)
- Regulatory clock (`sla_clock_started_at`, `decision_due_at` = +30 days, limitation of 3 years for own policy / 7 years for third party): **DOC only**. These fields appear in neither `web/db/schema.sql` nor `web/src` (grep found 0 hits) — [docs/regulatory-clock.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/regulatory-clock.md), [docs/mvp-scope.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/mvp-scope.md) (listed as a "candidate")
- Not built: the demand letter (`demand_letter`), the merged submission packet for the insurer (0930-10: "send-to-insurer is download-and-reattach per file"), and the owner value report / repair value (0930-09b) — [docs/claim-management.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/claim-management.md), [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md)

### Inferences
- Our strongest concrete asset is **cross-insurer form coverage (11 Israeli insurers) from a single client intake**, combined with an approved WhatsApp chase loop. Compare ClaimAI's insurer coverage directly on this point.

### Gaps
- No integration with insurer portals or APIs, no electronic submission to the insurer, no payment tracking, no multi-user/agency roles (multi-agency deferred).

## 5. Claim tracks and third-party handling

### Takeaway
BUILT: four tracks (`own_policy`, `third_party_report` "דוח פרטי", `third_party_settlement` "הסדר", `unknown`). Third party is the intended differentiator: the business, not the AI, picks report vs. settlement, and each has its own checklist and task chain. Finding an **unknown third-party insurer is a manual task (`get_tp_insurer`) plus a client chase**; there is no automated lookup.

### Cited Findings
- Layer 1, deterministic (fault × third party identified × coverage) → own policy vs. third party. Layer 2: report vs. settlement is a business choice (`needsAgentChoice`, report recommended by default) — [docs/claim-management.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/claim-management.md), [web/src/lib/claims/classify.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/claims/classify.ts)
- The "דוח פרטי" document set (garage invoice, appraiser report, אישור אי-הגשה, insurance history, demand form) is handled in the checklist; the `policy_activated` flag switches the case to a loss claim ("אישור הפסדים"). Subrogation (שיבוב) is future work — [docs/claim-management.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/claim-management.md)
- `get_tp_insurer` is spawned on track confirmation when the at-fault insurer is missing (including hit-and-run), and has an outbound chase rule — [web/src/lib/tasks/templates.ts](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/src/lib/tasks/templates.ts), [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md) (PR #50)
- The garage does handle third-party claims, so the third-party rules were kept — [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md)
- Planned and NOT built (from this conversation, not in the repo): querying the public "is vehicle X insured with insurer Y on date D" lookups that ~13 Israeli insurers offer (plate + date) to find an unknown third-party insurer automatically. There are no references in `web/src` or `docs/` (grep) — source: the user's conversation with the coordinator. Repo: none.

### Inferences
- The insurer-lookup feature would plug directly into the existing `get_tp_insurer` task: auto-complete it, or pre-fill `third_parties.insurer`.

### Gaps
- R1 (how common the loss-claim route is) and the track distribution across the 50 claims are not measured.

## 6. Security, privacy, stack and deploy

### Takeaway
BUILT: Next.js 16 + TypeScript + Supabase (Postgres/Auth/Storage, RLS on every table) + Claude + Vercel, with separate dev and prod Supabase projects and a private document bucket. There is ops hygiene (schema-drift health check, error alerts). The privacy posture is reasonable for a pilot but **has not been legally reviewed**, and retention, token-expiry and deletion gaps are open.

### Cited Findings
- Stack and deploy: one Vercel project; Production → the `claims-pilot` Supabase project (real PII); Preview/Dev → the sandbox project; PII never flows down to dev. Migrations are applied by hand, guarded by the `migration-guard` CI and a `/api/health` 503 on schema drift — [docs/status.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/status.md), [CLAUDE.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/CLAUDE.md)
- RLS is enabled on all 11 app tables plus `schema_migrations`. The `anon` role has no table access (migration 009). Business routes use a user session; claimant routes use the service role behind the token — [web/db/schema.sql](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/web/db/schema.sql), [docs/architecture.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/architecture.md)
- Hardening shipped in PRs #73–#78: unauthenticated `/api/analyze` and `/api/forms` removed, RLS hardening, submit compare-and-set (CAS) integrity, prod error alerts (`ALERT_WEBHOOK_URL` not yet set) — [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md)
- Open privacy gaps: claimant tokens never expire (the doc claims they do); consent is client-only and not recorded as an event; there is no deletion or retention path; an abandoned draft leaves PII in the DB; the full PII is sent to Anthropic — [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md) (0930-11, 0930-16), [docs/architecture.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/architecture.md)
- T1 (storing PII under חוק הגנת הפרטיות with consent) is 🟡: "לא נבדק משפטית" (not legally reviewed) — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)

### Inferences
- There is no compliance certification (ISO 27001 etc.) and no documented DPA (data processing agreement). If ClaimAI states certifications, that is a gap on our side for enterprise or insurer buyers.

### Gaps
- Upload size limits through the Vercel function (~4.5 MB vs. the app's caps) are unverified (0930-12).

## 7. Pricing and willingness to pay

### Takeaway
**No price has been set or validated.** The pilot is free (~10+ weeks). The documented plan is a **flat monthly subscription per business with unlimited claims**, anchored to the value of one repair job, not to hours saved. Marginal AI cost is ~$0.04 per claim.

### Cited Findings
- B1 ("will pay a monthly subscription") is ⬜, "the most dangerous assumption, and the only one that hasn't moved" — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)
- Recommended structure: a fixed monthly subscription per business, unlimited claims; not per claim and not a "form module" SKU. Anchor: "one extra repair job a month is worth more than any subscription". The commitment test: "starting billing on the 1st — I'll send details" — [docs/validation-guide.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/validation-guide.md)
- B5: the buyer (owner) is not the user (פקידה), so the pitch is jobs captured and cash cycle, not saved hours — [docs/validation-guide.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/validation-guide.md), [CLAUDE.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/CLAUDE.md)
- Cost: ~$0.04 per claim, ≈ ₪6/month at current volume, so any reasonable price is ~100% margin — [docs/validation-guide.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/validation-guide.md)
- B4 risk: insurers are digitizing their own accident forms (שלמה offers digital self-service), so the product must not be positioned as a form-filler. The moat is meant to be cross-insurer + case management + third party, but that layer is exactly the part not yet validated — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md)

### Inferences
- ClaimAI's public pricing, if any, is a useful external anchor for the upcoming owner conversation.

### Gaps
- No actual ₪ figure exists anywhere in the repo.

## 8. Differentiators (as the repo argues them) and known gaps / backlog

### Takeaway
The claimed differentiators: one client intake → **11 insurers' accident-notice forms auto-filled**; **third-party track handling** (report vs. settlement, private-report document set, `get_tp_insurer`); a deterministic, auditable classifier with the AI limited to signals; WhatsApp-native distribution plus approved chases; built for **garages and agents** (cross-insurer, owned by the business, not the insurer). The main gaps: an unvalidated management layer, n=1, no pricing, no OCR or doc validation, no submission packet, no regulatory clock, no automatic messaging.

### Cited Findings
- Positioning decision (2026-06-28): "not a form-filler but the agent's cross-insurer claim-management layer". An insurer's own form is one insurer and serves the insurer — [docs/assumptions-canvas.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/assumptions-canvas.md) (decision log)
- "Third-party is the sharpest differentiation" — [CLAUDE.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/CLAUDE.md), [docs/mvp-scope.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/mvp-scope.md)
- Out of the MVP / deferred: unattended auto-send (cron + BSP), WhatsApp Business API, OCR, billing, multi-agency, subrogation, payment tracking, chasing the garage/appraiser/insurer — [docs/mvp-scope.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/mvp-scope.md)
- Open improvement items: 0930-09b owner report + repair value; 0930-10 submission packet; 0930-11 PII minimization to the AI; 0930-12 direct-to-Storage uploads / HEIC; 0930-15 template tests; 0930-16 link hygiene and retention; 0930-18 form missing-fields not cleared by edits; 0930-19 follow-up page UX; 0930-20 duplicated insurer catalogs — [docs/improvement-log.md](https://github.com/eylonbenda/digital-claims-assistant-/blob/main/docs/improvement-log.md)
- Recent progress (git log, top of `main`): PRs #80–#84 (2026-10-09): dated milestone ticks, stalled-claimant nudge, activity ordering + "new" badge, dashboard pagination — `git log` on `main` @ `886774e`

### Inferences
- Where ClaimAI likely overlaps: intake + form. Where we can claim an edge, if ClaimAI lacks it: breadth of the 11-insurer templates, third-party workflow, garage focus. Where we are likely behind: AI depth (OCR, damage, chat), maturity and customer count, compliance claims.

### Gaps
- `docs/status.md` is partly stale (it still says "not deployed / needs Supabase keys" while the pilot is live; 0930-14), so I relied on the PR-level entries and the code.
