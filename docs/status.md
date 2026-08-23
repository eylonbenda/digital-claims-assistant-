# Status & Next Steps

> **Session breadcrumb** — read this first when resuming. Last updated **2026-08-16**.
> **Session breadcrumb** — read this first when resuming. Last updated **2026-08-13**.
> Source of truth is still the individual docs; this is just "where we are + what's next" so a fresh session can pick up without a recap.

## How to resume
```
cd C:\Users\eylon\digital-claims-assistant   # launch from here so CLAUDE.md auto-loads
claude
```
Then read this file + `CLAUDE.md`. The work lives in the repo, not in chat history.

---

## Deploy topology (pilot, set 2026-07-19)

Two **separate Supabase projects**, mapped to Vercel env **scopes** on one Vercel project (root dir = `web`, production branch = `main`):

| Vercel scope | Supabase project | Reached by |
|---|---|---|
| **Production** | `claims-pilot` (real client PII) | merge to `main` → prod deploy |
| **Preview** | dev/sandbox project | any branch push / PR → preview deploy |
| **Development** | dev/sandbox project | `vercel env pull`; local `npm run dev` actually reads `web/.env.local` (dev keys) |

Env vars per scope: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (prod vs dev values); `ANTHROPIC_API_KEY` same across scopes. **Never put prod keys in `web/.env.local`.** `NEXT_PUBLIC_SUPABASE_URL` = bare project origin `https://<ref>.supabase.co` — no `/rest/v1/` suffix.

### Promoting a change to prod — checklist
Vercel deploys **code**, not **schema**. There is no auto-migration. So:

1. Develop on a branch; run any new `web/db/migrations/NNN_*.sql` **against the dev Supabase** SQL editor while building.
2. PR → CI (lint/test/build) must be green. The preview URL runs against dev — eyeball it.
3. **If the branch added a migration:** before or in lockstep with the merge, paste that same migration into the **prod (`claims-pilot`) SQL editor** and run it. Prod schema must be ready *before* the new code goes live.
4. Merge to `main` → Vercel auto-deploys Production against prod Supabase.
5. Post-deploy smoke: hit `/api/health` (key wiring) + `/api/version`.

**The trap:** a merged PR whose migration you forgot to apply to prod deploys green, then 500s at runtime on the missing column/table. Migrations are a *two-place* change — code by merge, schema by hand.
**PII rule:** schema flows **up** (dev → prod); production data never flows **down** to dev (חוק הגנת הפרטיות).

---

## Where we are (mapped to the build order in [mvp-scope.md](mvp-scope.md))

| # | Step | State |
|---|---|---|
| 1 | Scaffold (Next 16 + TS + Tailwind v4, RTL) | ✅ done — `web/`. **Not yet deployed to Vercel.** |
| 2 | Data model + agent Auth + claim creation + link | ✅ **done** (pending Supabase provisioning) — schema + RLS in `web/db/schema.sql` (a complete table/RLS snapshot — folds in migrations 004–008: expanded `doc_type`, circumstance flags, `claim_notes`, `tasks` engine columns, `agent_briefs`, `outbound_events`); migrations in `web/db/migrations/` (001 agent setup, 002 PostgREST grants, 003 storage bucket, 004–008); auth routes + middleware + dashboard written. **Needs real Supabase keys in `web/.env.local`.** |
| 3 | Collection web-app | ✅ done — `web/src/components/collection/` — a **registry-driven RTL wizard**: 13 steps in 4 chapters (intro / שאלות מהירות / הפרטים / סיום) declared in the pure `steps.ts`, rendered one component per step, framed by `WizardShell.tsx` (chapter chips + dots + milestone screens) and driven by `CollectionWizard.tsx`. Incl. **own-insurer select**, a **"מי נהג" (who was driving)** step, a **document-upload step**, and an **insured declaration** — data-consent + optional צד-ג' power-of-attorney — gating the submit. The quick chapter is **tap-first** (one tap answers + auto-advances); driver-details and third-party-details steps appear only when relevant. The vehicle step **auto-fills make/model + year from the plate** via the Ministry of Transport registry. Submit calls `POST /api/claims/submit`. Progress is **resumable** — step **key** + answers saved per token in `localStorage` (`web/src/lib/collection/persist.ts`), cleared on submit. |
| 4 | AI processing | ✅ done — `POST /api/analyze` → `web/src/lib/ai/analyze.ts`. **Now a two-layer classifier**: the LLM emits narrative signals only; a deterministic `web/src/lib/claims/classify.ts` owns the track + confidence. Analysis cached in `summary_json.analysis`. Wired into the **agent detail page only** (`getOrCreateAnalysis`) — the client wizard no longer calls it. |
| 5 | Form overlay fill | ✅ **done + persisted** — `POST /api/forms/[insurer]` (fill from a canonical claim body; the demo `GET` preview was removed when the homepage became a public landing page). All 11 insurer templates wired: הכשרה, מגדל, מנורה, הראל, AIG, שלמה, ליברה, הפניקס, איילון, שומרה, כלל. **Now written to `generated_forms` + Storage**: auto-filled at submit from the claimant's insurer, and `GET /api/claims/[id]/form/[insurer]` (agent, RLS-gated) regenerates on demand (latest-per-insurer). **Agent can now edit/complete the canonical form fields** (`FormFieldEditor` → `PATCH /api/claims/[id]/form-data`, stored in `summary_json.form_data`; `effectiveClaimData` prefers it, client `collected` left untouched). הפניקס is mapped **visually from a render** (no OCR — its text layer is broken); איילון maps the insurer's **new official form** (extractable text layer, bundled as `assets/ayalon.pdf`); כלל maps only pages 3–5 (נספח ב') of the insurer's multi-page claim kit. |
| 6 | Per-track checklist | ✅ **done** — dynamic per-track config `web/src/lib/claims/checklist.ts` (base/late/conditional/milestone sections; doc items auto-check from `claim_documents`, milestones tick via `PATCH /api/claims/[id]/checklist`, conditional items driven by circumstance flags — migration `004`; a conditional item's flag gates whether it **blocks**, not whether it's listed). Agent uploads later docs via `POST /api/claims/[id]/documents`; confirms track via `PATCH /api/claims/[id]/classify`. Rendered on `/dashboard/[id]`. |
| 7 | Basic dashboard | ✅ **done** — `web/src/app/dashboard/page.tsx` is now a **one-list index**: `TodayList.tsx` renders one card per open claim in three sections (צריך אותך היום / בהמתנה לאחרים / תקינים), composed by pure `web/src/lib/dashboard/compose.ts` + `copy.ts` from the morning brief (`web/src/lib/brief/`), the outbound queue (`web/src/lib/outbound/`) and open tasks — the old `MorningBrief.tsx` / `OutboundQueue.tsx` panels are deleted and `ClaimsTable.tsx` slimmed to a searchable archive table below. Send/skip still one-tap wa.me, recorded in `outbound_events`. Plus the **`/dashboard/[id]` claim-detail cockpit**: a persistent header (`CockpitHeader.tsx` — identity + status badge + days-open + AI one-liner + one derived **next action**, with the one-click **WhatsApp doc chase** / advance-next-milestone / open-the-relevant-tab as its button) over **4 badge-carrying tabs** (`CockpitTabs.tsx` — סקירה / עבודה על התיק / טופס ההודעה / קבצים, derived by `web/src/lib/cockpit/`): proposed classification (confidence + rationale, collapsed once confirmed) + **agent notes** scratchpad (`claim_notes`, `POST /api/claims/[id]/notes`, migration `005`) on סקירה, tasks + checklist + agent doc upload on עבודה על התיק, the filled accident-notice form (insurer options server-derived from the `formfill` template registry) + collapsible form-field editor on טופס ההודעה, and the uploaded documents on קבצים. Feeds from Supabase RLS. **Needs Supabase keys to go live.** |
| 8 | UX polish + run with design partner | ❌ not started |

Beyond the original build order, the **task engine** (phase-2 active workflow, pulled forward) is now built: `web/src/lib/tasks/` (pure `advanceTasks` + `runEngine` + per-track rule table) drives event-driven task spawn/complete + forward-only status advance; `TasksPanel` on `/dashboard/[id]`, and due/overdue tasks folded into the dashboard-index cards; `POST`/`PATCH /api/claims/[id]/tasks[/taskId]` for manual tasks. Migration `006` adds the `tasks` columns + idempotency index. Vitest wired (`web/vitest.config.ts`, engine/template unit tests). Phase-2 step **C1** (outbound queue) is now built on top of it — `web/src/lib/outbound/` + `POST /api/outbound/events` + migration `008` (`outbound_events`).

**In one line:** the full pipeline is built end-to-end — collection + upload + two-layer classification + form persistence + per-track checklist + agent surfacing + a task engine + an agent-approved outbound queue, all now surfaced as **one composed list** on the dashboard index and a **tabbed claim cockpit** (one next action + 4 tabs) on the claim page. Blocked only on Supabase provisioning (fresh DB: run `web/db/schema.sql`, then migrations `001` / `003` — see the provisioning steps below; existing DBs still need `004`–`008`, which are all safe to re-run).

---

## What was built this session (2026-06-26)

| File | What |
|---|---|
| `web/src/lib/supabase/service.ts` | Service-role client (bypasses RLS, server-only) |
| `web/src/middleware.ts` | Session refresh + `/dashboard` guard → `/login` redirect |
| `web/src/app/api/auth/login/route.ts` | `POST` email+password → Supabase signInWithPassword |
| `web/src/app/api/auth/logout/route.ts` | `POST` → signOut |
| `web/src/app/api/claims/route.ts` | `GET` list + `POST` create (auto-creates agent row) |
| `web/src/app/api/claims/submit/route.ts` | `POST` client submit via token (service role, no session needed) |
| `web/src/app/login/page.tsx` | Agent login page |
| `web/src/app/dashboard/page.tsx` | Dashboard: claims table + new-claim form + logout |
| `web/src/app/dashboard/NewClaimForm.tsx` | Creates claim → shows copy-link + WhatsApp button |
| `web/src/app/dashboard/ClaimsTable.tsx` | RTL claims table with status badges + copy-link |
| `web/db/migrations/001_agent_setup.sql` | Auto-create agent trigger on `auth.users` insert |
| `web/src/app/c/[token]/page.tsx` | Token validation → already-submitted screen or wizard |
| `web/src/components/collection/CollectionWizard.tsx` | Added `prefill` prop + wired submit button to API |

---

## Next step: provision Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `web/db/schema.sql` in the SQL editor
3. Run `web/db/migrations/001_agent_setup.sql` (agent trigger + insert policy), then `web/db/migrations/003_storage.sql` (creates the private `claim-docs` bucket — without it, document upload + form persistence fail with "Bucket not found"). Those two are the only migrations a fresh DB still needs: they touch `auth.users` and Storage, which `schema.sql` doesn't cover.
   - `schema.sql` is a **complete table/RLS snapshot** — it already contains `002_grants.sql`'s grants and everything in `004`–`008` (expanded `doc_type` enum, circumstance flags, `claim_notes`, the `tasks` engine columns + `tasks_claim_key_open_uniq` index, `agent_briefs`, `outbound_events` + its cooldown index, and their RLS policies), so on a **fresh** DB none of `002`–`008` are needed. Re-running them anyway is harmless: every statement is `if not exists`-guarded and each `create policy` is preceded by `drop policy if exists`.
   - An **existing** DB created from an older `schema.sql` still needs `002`–`008` applied in order, as before.
   - ⚠️ **Nothing applies migrations automatically.** Deploying to Vercel does not touch the database — each migration must be pasted into the Supabase SQL editor by hand. Skipping one fails at runtime, often silently: migration `007` was missed on prod and the morning brief re-ran the LLM on every dashboard load for days before anyone noticed.
4. Copy keys into `web/.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   ```
5. Create a test agent user in Supabase Auth (Dashboard → Authentication → Users → Invite / Add user)
6. `cd web && npm run dev` → go to `/login` → create a claim → send link → fill wizard → see it appear in dashboard

### Done since last sync (2026-06-28 → 29)
- **Document upload** (wizard step 9): `POST /api/claims/documents` → private `claim-docs` bucket, with magic-byte sniffing (`web/src/lib/files/sniff.ts`) + client-side compression.
- **Capture own-insurer** in the wizard (`policy_insurer`) — drives which form template fills.
- **Form persistence**: auto-filled at submit + on-demand via the agent route; written to `generated_forms` + Storage.
- **Agent surfacing**: `/dashboard/[id]` shows uploaded docs (signed URLs) + the filled form.
- Shared `web/src/lib/collection/claim-state.ts` (State + `toClaimData`) so submit reuses the wizard mapping server-side.
- **`GET /api/version`** — reports the running app name + version (`npm_package_version`, default `0.1.0`); sibling of `GET /api/health`, handy for verifying deploys.

### Done since last sync (2026-06-29 → 07-02)
- **Two-layer classifier** (`web/src/lib/claims/classify.ts`): LLM emits narrative signals only; a deterministic pure function owns the track + confidence + report-vs-settlement recommendation + viability/fault-mismatch warnings. `analyze.ts` reworked to signals-only; analysis lazily cached in `summary_json.analysis` (`analysis-cache.ts`).
- **Dynamic per-track checklist** (`web/src/lib/claims/checklist.ts`): sectioned config, doc auto-check, flag-driven conditional items, manual milestone ticks. Rendered on `/dashboard/[id]` (`ChecklistPanel`, `ClaimTypeConfirm`, `AgentDocUpload`).
- **New API routes:** `PATCH /api/claims/[id]/classify`, `PATCH /api/claims/[id]/checklist`, `POST /api/claims/[id]/documents` (agent upload).
- **Migration 004:** expands the `doc_type` enum + adds circumstance-flag columns. Wizard now also captures `insurance_type` on the identity step.

### Done since last sync (2026-07-02 → 07-04)
- **Agent edits accident-form fields:** `FormFieldEditor` on `/dashboard/[id]` lets the agent complete/correct the canonical form fields; `PATCH /api/claims/[id]/form-data` persists the edited `ClaimData` to `summary_json.form_data` (logs a `form_data_edited` event) without touching the client's `collected` submission. New `web/src/lib/formfill/effective.ts` (`effectiveClaimData`) — the form-fill route prefers `form_data`, falling back to `collected`.

### Done since last sync (2026-07-04 → 07-05)
- **Claim-detail cockpit** (`/dashboard/[id]` redesign): a persistent **cockpit header** (`CockpitHeader.tsx`) — identity + colored status badge + days-open + AI one-liner + a single derived **primary next action** (chase semantics preserved: a **one-click WhatsApp doc chase** pre-filled with the blocking client-suppliable items + the client's `/c/[token]` upload link, when such items are outstanding) — plus 4 tabs (`CockpitTabs.tsx`: סקירה / עבודה על התיק / טופס ההודעה / קבצים) carrying derived badges (`lib/cockpit/derive.ts`), and collapsible classification + form-field-editor sections within the relevant tabs. All next-action + badge signals are derived from the existing checklist (no extra I/O). `FormGenerator` insurer options are now server-derived from the `formfill` template registry (`Object.keys(templates)`).
- **Agent notes:** `NotesPanel.tsx` + `POST /api/claims/[id]/notes` — a timestamped free-text scratchpad for the case file, backed by the new `claim_notes` table (**migration `005`**, RLS via `claim_belongs_to_me`).

### Done since last sync (2026-07-05 → 07-08)
- **Task engine** (`web/src/lib/tasks/`): pure, idempotent `advanceTasks` (`engine.ts`) over a declarative per-track rule table (`templates.ts`, due-offsets from `regulatory-clock.md`) → `{ spawn, complete, statusAdvance }`. `runEngine` (`runner.ts`) fetches state, applies inserts/updates, and runs **best-effort** (never fails the triggering mutation) inline from the submit / classify / checklist / documents routes on the events `claim_submitted` / `track_confirmed` / `milestone_ticked` / `doc_uploaded`. Status advances are forward-only + compare-and-set.
- **Manual tasks + UI:** `POST /api/claims/[id]/tasks`, `PATCH /api/claims/[id]/tasks/[taskId]` (agent ad-hoc tasks, `source='manual'`, never auto-completed); `TasksPanel` on `/dashboard/[id]` + a next-task/overdue column + due-date sort on the dashboard list.
- **Migration `006`** (`tasks` columns `key`/`source`/`note`/`completed_at` + `tasks_claim_key_open_uniq` partial index). **Vitest** wired (`web/vitest.config.ts`; `engine.test.ts` + `templates.test.ts`).

### Remaining work
- **AI doc-validation** (spec only — `docs/ai-doc-validation.md`): is the uploaded file actually a driver's license? Phase 1 = classify-only warning.
- **Task-engine reminders/notifications:** the engine spawns/completes tasks but does not yet send reminders or chase externally (phase 2).

### Done since last sync (2026-07-05 → 07-11)
- **איילון remapped to the insurer's new official form** (`docs/accidentStatementPdf/איילון_טופס_הודעה_חדש.pdf`, bundled as `web/src/lib/formfill/assets/ayalon.pdf`): the old template mapped a scanned/image-only PDF measured purely visually; the new form has a clean **extractable text layer**, so `web/src/lib/formfill/templates/ayalon.ts` was rewritten from printed-label glyph coordinates (`.pdfwork/coords.mjs`) + CTM-aware checkbox rects (`.pdfwork/boxdetect2.mjs`), no OCR needed. **No longer an OCR-pending insurer.**

### Remaining work
- **AI doc-validation** (spec only — `docs/ai-doc-validation.md`): is the uploaded file actually a driver's license? Phase 1 = classify-only warning.
- **UX polish** (step 8): design partner run.

### Done since last sync (2026-07-11 → 07-18)
- **"מעקבים להיום" — day digest on the dashboard index** (`web/src/lib/tasks/digest.ts` `buildDigest` → `web/src/app/dashboard/FollowupsPanel.tsx`): every open task due-today-or-overdue across all claims, grouped per claim, most-urgent-first, with "באיחור N ימים"/"להיום" badges and a one-click **wa.me client chase** on `chase_missing_docs` tasks (pre-filled with the client's `/c/[token]` upload link). Day boundary is the UTC calendar day. Hidden entirely when empty. Unit-tested (`digest.test.ts`).
- **`waPhone` extracted** into `web/src/lib/wa.ts` (shared by `CockpitHeader` + the digest; `wa.test.ts`).

### Done since last sync (2026-07-18 → 07-28)
- **Public landing page at `/`** (`web/src/app/page.tsx`, for opentik.co.il): Hebrew/RTL marketing surface under the **OpenTik** name — hero (before/after WhatsApp-chase → ordered תיק), pains, "איך זה עובד" 3 steps, a filled-form proof shot (`web/public/landing/form-sample.png`), and wa.me demo CTAs. `Frank_Ruhl_Libre` display face for headlines only; CSS animations respect `prefers-reduced-motion`. Agent entry is now a **"כניסת סוכנים"** link to `/login` in the header + footer.
- **Demo `GET /api/forms/[insurer]` removed** — the route is `POST`-only now (fills from a canonical claim body). `web/src/lib/formfill/sample-claim.ts` stays for `web/scripts/fill.ts` QA renders.
- **Morning brief** (`web/src/lib/brief/`) **supersedes the follow-ups digest** (`digest.ts` + `FollowupsPanel.tsx` deleted) — phase-2 step B v1, PR #23. Per open claim, `facts.ts` builds a fact sheet (track, days-open, overdue tasks, blocking docs from `computeChecklist`, staleness, urgent/unclassified) and `score.ts` computes a deterministic priority score from hard signals only. `rank.ts` sends the sheets to Claude (`CLAIMS_MODEL`, adaptive thinking, `json_schema` output) for a per-claim **tier** (`act_now`/`this_week`/`waiting`/`ok`) + one Hebrew reason + soft `flags`; `sanitizeSignals` gates the LLM output (drops unknown ids/malformed entries — a hallucinated `claim_id` can't reach the UI) and `fallbackTier` gives a rules-only tiering when AI is unavailable. The prompt carries only id/name/score/facts — **no phone, no access token**. `brief.ts` (`getOrCreateBrief`) is a best-effort I/O wrapper: it caches **only the AI ranking** per agent per UTC day (**never** persists a degraded one) and **recomputes the deterministic action fields — blocking docs, next task — live on every read**, so a doc uploaded after the ranking ran can't produce a stale one-click chase; returns `null` on any failure so the dashboard still renders. Rendered by `MorningBrief.tsx` (tiered sections, per-claim wa.me chase, refresh button). New `agent_briefs` table (**migration `007`** — applied to Supabase on 2026-07-29, see PR #26; RLS: agent reads own, writes service-only). `POST /api/brief/refresh` re-runs the ranking. Unit-tested (`brief`/`facts`/`rank`/`score`.test.ts).
- **`wa.ts` chase copy centralized:** added `chaseMessage`/`chaseHref` (one builder for the cockpit strip + brief), alongside the existing `waPhone`.

### Done since last sync (2026-07-28, PR #25 — field fixes)
- **Dates print dd/mm/yyyy, not ISO.** New shared `toILDate` (`web/src/lib/dates.ts`) + `normalizeClaimDates` (`web/src/lib/formfill/dates.ts`), which `fillForm` applies to the whole claim **at the fill boundary** — so every path is covered (client submit, agent on-demand regeneration, agent-edited `summary_json.form_data`) instead of only the declaration date. Conversion is keyed on field name (`date` / `birth_date` / `license_date` / `license_expiry`), so array members like `injured_persons[]` are reached too; non-ISO values pass through and the input is deep-copied (`collected` stays an untouched audit record). The ad-hoc `formatDateIL` / `formatDateILDisplay` helpers in `claim-state.ts` + `CollectionWizard` were replaced by `toILDate`, which the wizard's summary now also uses for the accident date. Unit-tested (`dates.test.ts` ×2).
- **Mobile upload: gallery + Files, not camera-only.** Dropped `capture="environment"` from the `DocField` file inputs in `CollectionWizard` + `FollowupUpload` (it forces the camera on iOS/Android and hides gallery/Files), and widened `accept` to `image/*,application/pdf` — which the server sniff already allowed.

### Done since last sync (2026-07-28 → 07-29, PR #26 — morning-brief day cache)
- **The brief re-ran the LLM on every dashboard load in production.** `agent_briefs` lived only in migration `007`, which had never been applied to the prod Supabase — so the day-cache read and upsert both errored, both errors were discarded, and an unusable cache was indistinguishable from a cold one. Running `007` against prod fixed it immediately, no redeploy. Two code halves keep it from recurring:
  - `web/db/schema.sql` is now a **complete fresh-install snapshot**: `agent_briefs` (`007`) and `claim_notes` (`005`) with their RLS policies, migration `004`'s circumstance-flag columns and 11 extra `doc_type` values, and migration `006`'s `tasks` columns. Both new tables are declared **before** the grants block so the blanket `grant all on all tables` covers them. Verified by applying the file to a clean Postgres 16 (Supabase bits stubbed): no errors, RLS + `service_role` grants present, `doc_type` at 22 values, and the app's `(agent_id, brief_date)` upsert conflict target resolves.
  - `web/src/lib/brief/brief.ts` no longer swallows cache I/O errors: a failed `agent_briefs` read **or** upsert now `console.error`s that the AI ranking will re-run on every page load and names migration `007` as the likely cause. Behaviour is otherwise unchanged (still best-effort, still returns `null` on failure).
- **Not covered:** when `rankClaims` returns `null` the code deliberately caches nothing, so an Anthropic outage still means one LLM call per refresh with no backoff — same symptom, different trigger, left for a separate change.

### Done since last sync (2026-07-29, PR #27 — conditional-docs blocking)
- **Conditional docs no longer block claims whose facts never called for them.** In `own_policy`, `police_report` / `keys` / `lien_release` were hard-coded `blocking: true` regardless of the circumstance flags, so every ordinary collision claim read as "not submittable — missing אישור משטרה / מפתחות / אישור הסרת שיעבוד". `ChecklistItemDef` gains an optional **`requiresFlag`** (`keyof ClaimFlags`), and `computeChecklist` forces `blocking: false` on any item whose flag is off: `theft` → police report + keys, `lien` → lien release, `business_use` → VAT-offset confirmation. Items stay **listed** either way (the agent may know one applies and upload it); `policy_activated`'s `loss_confirmation`-for-`no_claim_confirmation` swap is unchanged.
- **Blast radius, all in the intended direction:** blocking state is what drives the cockpit readiness strip (submittable-or-chase), the morning brief's `blocking_labels` + priority score, and the task engine's `blockingMissing` / `submit_to_insurer` spawn — all three stop firing on documents the claim never needed.
- New `web/src/lib/claims/checklist.test.ts` (Vitest) covers flag-off vs flag-on blocking, still-listed items, upload clearing a blocking conditional, and the untouched `third_party_report` swap. **No migration** — the flag columns already exist from `004`.

### Done since last sync (2026-07-29, PR #28 — repair receipt non-blocking)
- **The payment receipt no longer gates `third_party_report` readiness.** `repair_receipt` ("קבלה על תשלום") was `blocking: true` in the track's `late` section, but it can only arrive after the repair is paid — i.e. after the original invoice — so otherwise-ready claims sat at "not submittable" waiting for it. It is now `blocking: false` while staying `mandatory: true` (still listed and still required for the file); `garage_invoice` remains blocking. Same three consumers as PR #27 — readiness strip, morning-brief blocking-docs/score, task engine `blockingMissing` — stop firing on it.
- Covered by a new case in `web/src/lib/claims/checklist.test.ts` (receipt mandatory + non-blocking, `garage_invoice` still blocking). **No migration**, no schema or route change.

### Done since last sync (2026-08-05, PR #31 — unknown insurer/coverage + name prefill)
- **A client who doesn't know their insurer or coverage can now finish the wizard.** Both identity-step selects gained a **"לא בטוח/ה — הסוכן ישלים"** option (`unknown`), which satisfies the step's required-field gate. Downstream it is treated as *undetermined*, not as data: `toClaimData` omits `insurance_type` for `"unknown"` exactly as it does for `""` (`web/src/lib/collection/claim-state.ts`, `State.insuranceType` widened to `InsuranceType | "" | "unknown"`), and `POST /api/claims/submit` maps the insurer sentinel to `policy_insurer = null` — so the accident-notice auto-fill simply doesn't run and the agent picks the insurer + regenerates from the cockpit. The raw answer is still preserved in `summary_json.collected` for audit. In the classifier this lands on the existing `coverageKnown` path: no **אזהרת מימוש** is raised when coverage is unknown.
- **Name + phone prefilled from the agent's claim record** (`web/src/app/c/[token]/page.tsx`): the page now selects `client_name` alongside `client_phone` and seeds `insured.first_name` / `last_name` (naive first-word / rest split) / `mobile`. Both fields stay editable — a post-accident client shouldn't retype what the agent already typed.
- Covered by new cases in `web/src/lib/collection/claim-state.test.ts` (concrete type kept; `""` and `"unknown"` both omitted). **No migration**, no schema change.
### Done since last sync (2026-08-05, PR #30 — wizard progress persistence)
- **The collection wizard is resumable.** A client interrupted mid-flow (call, WhatsApp, tab eviction) previously restarted at step 0. New `web/src/lib/collection/persist.ts` (`saveWizardState` / `loadWizardState` / `clearWizardState`, key `claim-wizard:v1:<token>`) writes step + `State` to `localStorage` on every change and restores it in `CollectionWizard`; the save is cleared on successful submit.
- **Traps encoded in the code:** restore runs in an effect **after mount**, not in the `useState` initializer — the server render has no `localStorage` and diverging would break hydration. Keyed **per token** so two claims from the same phone can't bleed together. Uploads with status `uploading`/`error` are dropped on restore (they never reached the server); `done` ones survive because Storage already has them. The saved state is merged over empty+prefill per nested object, so a save from a deploy that predates a field still loads; `VERSION` in the key is the escape hatch for a breaking `State` change.
- **Storage is client-local only** — nothing new server-side, **no migration**, no schema or route change. Note that an abandoned claim leaves PII (name, ID, phone) in the device's `localStorage` until submit; see [architecture.md](architecture.md#5-security--privacy-from-day-one).
- Unit-tested: `web/src/lib/collection/persist.test.ts` (round-trip, per-token isolation, corrupt JSON, wrong shape, upload sanitising, old-save merge, prefill precedence, clear).

### Done since last sync (2026-08-05, PR #33 — client summary screen simplified)
- **The client's last screen is now review-and-send, nothing else.** The summary step (`step === 10`, `CollectionWizard.tsx`) dropped two agent-facing blocks that had been shown to the client: the **"סיכום חכם (AI)"** panel (`POST /api/analyze` + proposed-track / confidence / mismatch / viability / missing-info rendering) and the **accident-notice preview** ("צור טופס ממולא", `POST /api/forms/[insurer]`). Both belong to the agent cockpit; a client has no use for a machine reading of their own accident, and the form is filled automatically on submit anyway.
- **Tap a row to fix it.** Each summary `Row` is now a button carrying an `onEdit` that jumps back to the step that owns the answer (שם→2, נהג→3, רכב→4, מתי/איפה→5, מה קרה→6, מי אשם→7, נפגעים→1, מסמכים→9) — no paging back through the wizard. A **"מה קרה"** row (`accident.description`) was added, so all nine answers are reviewable.
- **Client-side only** — no route, schema, or engine change, **no migration**. `/api/analyze` and `/api/forms/[insurer]` still exist and still work; `/api/analyze` now has no in-app caller (the agent page computes analysis server-side via `getOrCreateAnalysis`).

### Done since last sync (2026-08-09, PR #40 — כלל + שומרה templates)
- **Two more insurer templates, registry now at 11.** `web/src/lib/formfill/templates/clal.ts` + `shomera.ts`, both registered in `formfill/index.ts`; blank source PDFs bundled as `assets/clal.pdf` / `assets/shomera.pdf` (picked up by the existing `assets/**` glob in `outputFileTracingIncludes` — no `next.config.ts` change needed). Because the cockpit's `FormGenerator` derives its insurer options from `Object.keys(templates)`, both appear in the agent's manual-fill dropdown with no further wiring.
- **Two client-side lists did *not* follow** (pre-existing pattern, worth a follow-up): `INSURER_LABEL` in `web/src/app/dashboard/[id]/page.tsx` has no `shomera` entry, so the cockpit dropdown falls back to the raw key `shomera` instead of "שומרה"; and `INSURERS` in `web/src/lib/collection/claim-state.ts` — the wizard's own-insurer select — lists no שומרה at all and still marks harel/clal/phoenix/ayalon/shlomo/libra/aig `templated: false` even though every one of them now has a template. Consequence: a שומרה client can't pick their insurer in the wizard, so the submit-time auto-fill never fires for them and the agent must generate the form manually. (`templated` has no other reader in the codebase.) The landing page's insurer strip (`web/src/app/page.tsx`) also still names only the original 9. → **both lists fixed in PR #44** (below); the landing-page strip is still the original 9.
- **כלל is a claim *kit*, not a single form:** the source PDF is a multi-page document (cover letter, נספח א' doc checklist, נספח ב' = the actual fillable form, נספח ג' terms). Only **pages 3–5** (engine page indices 2–4) carry positioned blanks; the template maps those and nothing else. Its label/blank convention is inverted vs. most forms — a bold column-**header** row with the input cell ~18pt *below* it, not beside it. It also carries a **bank-account** block (§7).
- **שומרה** is a single dense page of dashed cells, captions on the right edge (menora/migdal convention), with **מוסך + שמאי**, **חשבון בנק**, license origin (ישראלי/זר), and 8 checkbox groups detected via `.pdfwork/boxdetect.mjs`.
- **The mislabeled source PDF was fixed:** `docs/accidentStatementPdf/כלל_טופס_תאונה.pdf` (whose content was actually **מנורה**) is now `מנורה_טופס_תאונה.pdf`, and the real כלל form was added as `כלל_טופס-הודעה.pdf`. The long-standing "we have no real כלל form" trap in `CLAUDE.md` is retired. Note `.pdfwork/full_clal.txt` is still the *old* extract — i.e. מנורה text under a כלל name.
- **No migration, no schema or route change.** Not yet done: filled QA examples for the two new insurers under `docs/accidentStatementPdf/filled-examples/`.
### Done since last sync (2026-08-06, PR #37 — vehicle registry autofill)
- **The client types a plate, not a car.** On the wizard's vehicle step, "יצרן ודגם" + "שנת ייצור" are now auto-filled from the **Ministry of Transport open-data registry** ("רכב פרטי ומסחרי" on data.gov.il). New `web/src/lib/vehicles/registry.ts` (`lookupVehicle` + the pure `toVehicleInfo` / `mergeVehicleInfo` / `normalizePlate` / `isLookupablePlate` / `lookupUrl`) and `GET /api/vehicle/[plate]`, which **proxies the call server-side** (claimant IP never reaches the gov endpoint, no CORS, one egress point) and memoises up to 500 plates per instance.
- **Traps encoded in the code:** the merge is a **pure function outside the `setS` updater** — React may invoke an updater twice, and a version that also wrote the `autoFilled` ref saw its own write on the second pass and overwrote the claimant's typing. It fills only an empty field or a value this same mechanism wrote earlier (a corrected plate), never a typed one. The lookup is debounced 600 ms and guarded by a sequence ref so a stale response can't win. `kinuy_mishari` (commercial name) is preferred over `tozeret_nm`+`degem_nm`, whose import-type suffix (`אלפא רומיאו_אי`) is stripped.
- **A miss is a non-event** — not-found, non-OK, timeout (6 s) and parse errors all resolve to `null`; the route answers `200 {vehicle:null}` and the UI just says the car wasn't found and lets the client type it. Not an OCR path: only the plate leaves the app, and that dataset holds no owner identity.
- **Client-side + one new route only** — **no migration**, no schema change. Unit-tested (`web/src/lib/vehicles/registry.test.ts`: plate normalising/bounds, record→`VehicleInfo` mapping, merge precedence, filter URL).

### Done since last sync (2026-08-09, PR #39 — outbound queue, phase-2 step C1)
- ⚠️ **This branch adds `web/db/migrations/008_outbound_events.sql`.** Apply it to dev **and** to prod (`claims-pilot`) by hand before the merge goes live — see the promote-to-prod checklist above. Without it `loadQueue` logs the failed `outbound_events` read and hides the panel (it deliberately does **not** degrade to "no events", which would propose sends with no cooldown data and double-chase a client); the rest of the dashboard is unaffected.
- **"יוצא היום" — a two-lane outbound approval queue on `/dashboard`** (`web/src/lib/outbound/` → `OutboundQueue.tsx`), specced in [superpowers/specs/2026-08-09-outbound-queue-design.md](superpowers/specs/2026-08-09-outbound-queue-design.md). Lane 1 **"לשלוח היום"**: one row per due client chase — `chase_missing_docs` · `get_tp_insurer` · `collect_private_report_docs` — with the body rendered live (deterministic Hebrew builders in `wa.ts`, no LLM in the send loop), a message preview, and **[שלח בוואטסאפ]** / **[דלג]**. Lane 2 **"לטפל היום"**: every other due open *template* task (manual tasks stay in `TasksPanel`), plus give-up escalations. Ordering: brief tier → brief score → overdue days. Panel hides when both lanes are empty.
- **Only decisions are persisted.** New `outbound_events` table (**migration `008`**, folded into `schema.sql`; RLS: agent reads own via `claim_belongs_to_me`, writes service-role only) is an append-only log of `sent` / `skipped`; what is *proposable* is derived on every read from tasks + checklist state, so the queue can't go stale and needs no proposal state machine. `POST /api/outbound/events` records one decision (rejects unknown `task_key`, RLS ownership probe, service-role insert). `kind='sent'` means **"the agent tapped the wa.me link"**, not "delivered" — stated in the schema comment; it must become a real delivery record (BSP receipts) before any rule flips to auto.
- **Guards:** per-rule cooldown (3d / 3d / 4d) where a **skip suppresses exactly like a send**; **one message per claim per UTC day** (most-overdue wins, ties by `RULE_PRIORITY`); and give-up after `MAX_SENDS_BEFORE_CALL = 3` sends with no document arriving since — the row stops being proposed and becomes a "הלקוח לא מגיב על „<task>" — ליצור קשר טלפוני" escalation carrying the task's own subject.
- **The brief lost its inline chase button** — brief = per-claim triage, queue = per-task dispatch, so there is exactly one place a message is sent from. The cockpit readiness strip keeps its chase button but now **logs the same `outbound_events` row**, so a cockpit send counts toward the cooldown and the skip-rate metric instead of bypassing them. Traps encoded: `window.open` fires **synchronously** in the click handler (any `await` first and the popup blocker eats the send), and a failed event write resets the row instead of leaving it disabled.
- **Chase bodies only ask for what the client can supply.** `ChecklistItemDef` gains `clientSuppliable` (absent = true; `false` on `demand_form`, the agent-drafted מכתב דרישה) and a shared `chaseableLabels()` filters a blocking list to client-suppliable `kind='doc'` items before it reaches a message — the readiness strip still lists everything blocking. `appraiser_report` stays client-suppliable on purpose: on `third_party_report` the client commissions and holds the private appraiser's report.
- **`auto: boolean` on each rule descriptor is the flip-to-auto seam** — always `false` in C1. Flipping one later = set the flag + a cron sender writing the same rows with `actor='system'`; `queue.ts`'s cooldown logic governs both actors unchanged. The gate for flipping is the per-rule skip rate this queue is now measuring.
- Unit-tested: `web/src/lib/outbound/queue.test.ts` + `rules.test.ts`, plus new cases in `wa.test.ts` and `checklist.test.ts`. `load.ts` I/O stays untested, matching `brief/`. **Supersedes** the "task-engine reminders/notifications" remaining-work note above for the *client* recipient; garage / appraiser / insurer chasing is still out (no contact fields in the schema), and unattended auto-send is C2.

### Done since last sync (2026-08-11 → 08-12, PR #43 — one-list dashboard redesign)
- **No migration.** Pure presentation/composition change: no schema, no new API route, no change to how the brief or the queue is computed.
- **Two panels became one list.** `MorningBrief.tsx` and `OutboundQueue.tsx` are **deleted**; `/dashboard` now renders `TodayList.tsx` — one card per open claim, in three sections: **צריך אותך היום** / **בהמתנה לאחרים** / **תקינים** (an empty attention section reads "הכל טופל להיום ✅"; the waiting section hides when empty; the ok section is always collapsed behind a `<details>` toggle). A three-number counter strip at the top jumps to each section, and an empty book shows a first-claim prompt instead. Specced in [superpowers/specs/2026-08-11-dashboard-redesign-design.md](superpowers/specs/2026-08-11-dashboard-redesign-design.md).
- **The composition is pure and unit-tested.** `web/src/lib/dashboard/compose.ts` (`composeDashboard`) merges claims ⊕ queue ⊕ brief ⊕ open tasks into `ClaimCard`s: one primary `action_line` per card (client message > most-overdue do-task > "needs classification" > waiting/ok line), whatever lost that slot as a single `וגם:` line, and the brief's Hebrew reason as a 🤖 sub-line. Ordering: attention by brief tier → score → overdue days; waiting by nearest future due date; ok alphabetical (`localeCompare(…, "he")`). `web/src/lib/dashboard/copy.ts` is the language layer — every user-visible string on the index comes from there (greeting by Asia/Jerusalem hour, Hebrew date, track labels, reminder tails). `compose.test.ts` + `copy.test.ts`.
- **`SendItem` gained two presentation-only fields** — `doc_labels` and `last_sent_at` — so a card can say *what* is being waited on and *when* the last reminder went out. `doc_labels` comes from a new `labels()` on each `SendRule`, deliberately separate from `build()`: `collect_private_report_docs` displays `missingDocLabels` while `chase_missing_docs` displays the narrower `blockingLabels`. **No queue logic reads either field** — cooldowns, caps and give-up are untouched (`queue.test.ts` extended).
- **Honest fallbacks, not optimistic ones.** The waiting line uses the nearest open task including overdue-but-suppressed ones, so a claim never reads "אין פעולות פתוחות" while work is pending; a claim the client hasn't submitted yet reads "ממתינים ללקוח למילוי הפרטים".
- **`ClaimsTable.tsx` slimmed to an archive table** — client / type / date / copy-link, with a name-or-phone search box and a "כולל סגורים" toggle. The status-badge and next-task columns moved into the cards above and were dropped here.
- **Send/skip moved into the card** (`TodayList.tsx`) with the same contract as the old queue row: `POST /api/outbound/events`, `window.open` fired **synchronously** in the handler (any `await` first and the popup blocker eats the send), and a failed write resets the card instead of leaving it disabled.

### Done since last sync (2026-08-16, PR #49 — OpenTik brand assets)
- **No migration.** Assets + metadata only: no schema, no API route, no lib change.
- **A real logo kit under `web/public/brand/`**, specced in [superpowers/specs/2026-08-16-opentik-logo-design.md](superpowers/specs/2026-08-16-opentik-logo-design.md). The **SVG masters are the source of truth** — `icon.svg` (open-folder mark), `icon-favicon.svg` (simplified, rule lines dropped below 48px), `wordmark.svg`, `logo.svg` (self-contained lockup), `logo-mono-black/white.svg`, `logo-print-bw.svg`, `og-image.svg`. All text is **outlined paths**, so nothing renders through an installed font.
- **PNGs are generated, never hand-edited.** `npm run brand` (`web/scripts/build-brand-assets.mjs`) rasterizes icon-16/32/192/512, apple-touch (180), logo-400/1200 (transparent), logo-email (600w, flattened on white), logo-print-bw and og-image (1200×630), and writes the multi-size `web/src/app/favicon.ico` by hand (16/32/48 PNG-in-ICO container). `npm run brand:wordmark` (`scripts/gen-wordmark.mjs`) regenerates the outlined wordmark/lockup SVGs. Rasterizing uses **`sharp` 0.34.5**, deliberately *not* added to `package.json` — it resolves as an optional transitive dep of Next 16.
- **Wired into the app:** `metadata.icons` (icon 32/192/512 + apple 180) in `web/src/app/layout.tsx`; `metadata.openGraph` with `/brand/og-image.png` on the landing page, whose header text wordmark is replaced by the `/brand/logo.svg` lockup (`next/image`, `priority`).
- **Own test runner:** `npm run test:brand` → `node --test scripts/__tests__/brand-assets.test.mjs` (master-SVG invariants — viewBox, brand hexes, no `<text>`, mono files single-colour — plus rendered PNG dimensions, alpha, and the ICO header). It is **not** part of `npm run test` (Vitest).
### Done since last sync (2026-08-12, PR #44 — שומרה selectable + insurer lists caught up)
- **Closes the follow-up left open by PR #40.** `INSURERS` in `web/src/lib/collection/claim-state.ts` — the wizard's own-insurer select — gains `shomera` ("שומרה"), so a שומרה client can now pick their insurer and the submit-time auto-fill fires for them instead of leaving the agent to generate the form by hand. All 11 entries are now `templated: true`, matching the `formfill/index.ts` registry (`templated` still has no other reader in the codebase).
- **The cockpit labels שומרה too.** `INSURER_LABEL` in `web/src/app/dashboard/[id]/page.tsx` gains `shomera: "שומרה"`, so the insurer dropdown shows the Hebrew name rather than falling back to the raw key.
- **Still not caught up:** the landing page's insurer strip (`web/src/app/page.tsx`) names only the original 9 — no כלל, no שומרה.
- **No migration**, no schema, route, or engine change — two client-side lists only.

### Done since last sync (2026-08-12, PR #46 — claim cockpit tabs)
- **No migration.** Pure presentation/composition change on `/dashboard/[id]`: no schema, no new API route, no change to the checklist, task engine, brief or queue.
- **The readiness strip is gone; the header is the instrument panel.** `ReadinessStrip.tsx` is **deleted**, replaced by `CockpitHeader.tsx` (identity + status badge + days-open + last-activity + AI one-liner) carrying exactly **one** "הפעולה הבאה" line. Its chase semantics moved over verbatim — same `chaseMessage`/`waHref` body (client-suppliable blocking items + the `/c/[token]` upload link), same synchronous `window.open` via a plain `<a>` + `POST /api/outbound/events` log, same `PATCH /api/claims/[id]/checklist` milestone tick.
- **The page is 4 tabs** (`CockpitTabs.tsx`): **סקירה** (facts + readiness count + classification + notes) / **עבודה על התיק** (tasks + checklist + agent doc upload) / **טופס ההודעה** (generated forms + `FormGenerator` + `FormFieldEditor`) / **קבצים** (`ClaimDocuments`). All four panes are **server-rendered once and stay mounted** — switching is show/hide, so no refetch and no lost panel state — and the active tab mirrors into `?tab=` via `replaceState` (`page.tsx` reads `searchParams.tab` for the initial tab, `overview` when absent/unknown).
- **New pure module `web/src/lib/cockpit/`** — `derive.ts` (`deriveCockpit`: next-action precedence *classify → chase → most urgent open task → missing form fields → milestone → form ready → fill form → none*, plus tab badges = open tasks + blocking docs / missing form fields / doc count) and `copy.ts` (its Hebrew lines). No I/O, no clock read (the caller passes `now`); `derive.test.ts` + `copy.test.ts`.
- **Reuse over duplication:** `joinHe` is now exported from `web/src/lib/dashboard/copy.ts` and `taskLine` delegates to its `doActionLine`, so the index and the cockpit phrase the same work identically.
- **Confirming the track doesn't re-block the next action:** the "classify" branch keys off `claim_type !== 'unknown'` (`classificationUnconfirmed`), while the סקירה badge + expanded classification section still key off the wider `classificationNeedsAttention` (low confidence / needs a choice) — so a confirmed-but-low-confidence claim still flags for review without pinning the header to "confirm the track".

### Done since last sync (2026-08-13, PR #48 — chaptered tap-first collection wizard)
- **No migration.** Client-side only: no schema, no new API route, no change to submit, the classifier, the checklist or the task engine.
- **The wizard is registry-driven.** New pure `web/src/components/collection/steps.ts` owns step order, chapter, relevance and completeness (`STEPS`, `visibleSteps`, `firstIncompleteKey`, `isStepKey`); `CollectionWizard.tsx` re-derives its position from it every render instead of tracking a numeric index, so a relevance change can never leave the wizard pointed at a stale step. 13 steps in 4 chapters — intro / **שאלות מהירות** / **הפרטים** / **סיום** — with `driver_details` and `tp_details` conditional. The monolithic wizard was split: one component per step under `components/collection/steps/` (shared inputs in `steps/fields.tsx`), chrome in the new `WizardShell.tsx` (chapter chips + in-chapter dots + time-left line + milestone interstitial — never "שלב X מתוך N").
- **Tap-first quick chapter.** The four quick steps answer on a single tap and auto-advance (~250 ms, no המשך button). The exception is "יש נפגעים": it holds the screen so the 101/משטרה guidance is read. Traps encoded: the pending advance timer is cancellable, so a rapid no→yes double-tap can't let a stale "לא" navigation fire; the timer resolves its destination from refs at fire time, not from the click-time closure; and it's cleared on unmount.
- **Summary edit-jump returns to the summary.** `goTo` sets a one-shot flag consumed by the next navigation, so fixing an answer from the summary lands back on the summary rather than replaying the rest of the wizard — while navigating back manually clears the flag and resumes normal forward movement.
- **Persistence is v2.** `persist.ts` now saves the step **key** (`claim-wizard:v2:<token>`) rather than an index, so reordering steps can't misplace a resumed client; a leftover v1 blob is migrated best-effort (answers restored, resume at `firstIncompleteKey`, v1 key removed). A saved key that is no longer relevant also falls back to `firstIncompleteKey`.
- Unit-tested: new `web/src/components/collection/steps.test.ts` (order, conditional visibility, resume position, per-step completeness, key guard) + new cases in `persist.test.ts` (v2 round-trip, v1 migration, unknown key, clearing both versions).

---

## To run the AI path live
Add `ANTHROPIC_API_KEY` to `web/.env.local`, then:
```
cd web ; npm run dev
```
→ fill + submit the wizard at `/c/<token>`, then open that claim at `/dashboard/[id]` — the analysis runs **agent-side** on first open (`getOrCreateAnalysis`, cached in `summary_json.analysis`). The client wizard has no AI button.

## Pre-deploy gotchas (don't forget)
- ~~Swap the dev font for an OFL font~~ — **done**: `web/src/lib/formfill/assets/app-hebrew.ttf` is now **Noto Sans Hebrew** (OFL 1.1, static Regular; license bundled as `assets/OFL.txt`); all 9 forms re-QA'd under it (phoenix `driver_name` nudged right=558→540 for the wider glyphs).
- This Next.js is **v16** — its `web/AGENTS.md` says read `web/node_modules/next/dist/docs/` before writing Next code (async `params`/`cookies()`/`headers()`).
- Always consult the **`claude-api` skill** before touching Anthropic SDK code.
