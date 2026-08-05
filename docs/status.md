# Status & Next Steps

> **Session breadcrumb** — read this first when resuming. Last updated **2026-08-05**.
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
| 2 | Data model + agent Auth + claim creation + link | ✅ **done** (pending Supabase provisioning) — schema + RLS in `web/db/schema.sql` (a complete table/RLS snapshot — folds in migrations 004–007: expanded `doc_type`, circumstance flags, `claim_notes`, `tasks` engine columns, `agent_briefs`); migrations in `web/db/migrations/` (001 agent setup, 002 PostgREST grants, 003 storage bucket, 004–007); auth routes + middleware + dashboard written. **Needs real Supabase keys in `web/.env.local`.** |
| 3 | Collection web-app | ✅ done — `web/src/components/collection/CollectionWizard.tsx` (11-step RTL wizard, incl. **own-insurer select**, a **"מי נהג" (who was driving)** step, a **document-upload step**, and an **insured declaration** — data-consent + optional צד-ג' power-of-attorney — gating the submit). Submit calls `POST /api/claims/submit`. Progress is **resumable** — step + answers saved per token in `localStorage` (`web/src/lib/collection/persist.ts`), cleared on submit. |
| 4 | AI processing | ✅ done — `POST /api/analyze` → `web/src/lib/ai/analyze.ts`. **Now a two-layer classifier**: the LLM emits narrative signals only; a deterministic `web/src/lib/claims/classify.ts` owns the track + confidence. Analysis cached in `summary_json.analysis`. Wired into the wizard's review step + agent detail page. |
| 5 | Form overlay fill | ✅ **done + persisted** — `POST /api/forms/[insurer]` (fill from a canonical claim body; the demo `GET` preview was removed when the homepage became a public landing page). All 9 insurer templates wired: הכשרה, מגדל, מנורה, הראל, AIG, שלמה, ליברה, הפניקס, איילון. **Now written to `generated_forms` + Storage**: auto-filled at submit from the claimant's insurer, and `GET /api/claims/[id]/form/[insurer]` (agent, RLS-gated) regenerates on demand (latest-per-insurer). **Agent can now edit/complete the canonical form fields** (`FormFieldEditor` → `PATCH /api/claims/[id]/form-data`, stored in `summary_json.form_data`; `effectiveClaimData` prefers it, client `collected` left untouched). הפניקס is mapped **visually from a render** (no OCR — its text layer is broken); איילון maps the insurer's **new official form** (extractable text layer, bundled as `assets/ayalon.pdf`). |
| 6 | Per-track checklist | ✅ **done** — dynamic per-track config `web/src/lib/claims/checklist.ts` (base/late/conditional/milestone sections; doc items auto-check from `claim_documents`, milestones tick via `PATCH /api/claims/[id]/checklist`, conditional items driven by circumstance flags — migration `004`; a conditional item's flag gates whether it **blocks**, not whether it's listed). Agent uploads later docs via `POST /api/claims/[id]/documents`; confirms track via `PATCH /api/claims/[id]/classify`. Rendered on `/dashboard/[id]`. |
| 7 | Basic dashboard | ✅ **done** — `web/src/app/dashboard/page.tsx` (claims list + a **"תדריך בוקר" morning brief** panel — an AI-tiered, priority-ranked triage of all open claims, `web/src/lib/brief/` → `MorningBrief.tsx`, with a one-click wa.me client chase on blocking-doc claims; supersedes the old follow-ups digest) + **`/dashboard/[id]` claim-detail cockpit**: hero (identity + status badge + days-open + AI one-liner), a **readiness strip** (blocking-docs-or-not, with a one-click **WhatsApp doc chase** / advance-next-milestone), proposed classification (confidence + rationale, collapsed once confirmed), the checklist panel, agent doc upload, the filled accident-notice form (insurer options now server-derived from the `formfill` template registry), collapsible form-field editor, and an **agent notes** scratchpad (`claim_notes`, `POST /api/claims/[id]/notes`, migration `005`). Feeds from Supabase RLS. **Needs Supabase keys to go live.** |
| 8 | UX polish + run with design partner | ❌ not started |

Beyond the original build order, the **task engine** (phase-2 active workflow, pulled forward) is now built: `web/src/lib/tasks/` (pure `advanceTasks` + `runEngine` + per-track rule table) drives event-driven task spawn/complete + forward-only status advance; `TasksPanel` on `/dashboard/[id]` + next-task column on the dashboard list; `POST`/`PATCH /api/claims/[id]/tasks[/taskId]` for manual tasks. Migration `006` adds the `tasks` columns + idempotency index. Vitest wired (`web/vitest.config.ts`, engine/template unit tests).

**In one line:** the full pipeline is built end-to-end — collection + upload + two-layer classification + form persistence + per-track checklist + agent surfacing + a task engine. Blocked only on Supabase provisioning (fresh DB: run `web/db/schema.sql`, then migrations `001` / `003` — see the provisioning steps below; existing DBs still need `004`–`007`, which are now safe to re-run).

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
   - `schema.sql` is a **complete table/RLS snapshot** — it already contains `002_grants.sql`'s grants and everything in `004`–`007` (expanded `doc_type` enum, circumstance flags, `claim_notes`, the `tasks` engine columns + `tasks_claim_key_open_uniq` index, `agent_briefs`, and their RLS policies), so on a **fresh** DB none of `002`–`007` are needed. Re-running them anyway is harmless: every statement is `if not exists`-guarded and the two `create policy` calls are preceded by `drop policy if exists`.
   - An **existing** DB created from an older `schema.sql` still needs `002`–`007` applied in order, as before.
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
- **Claim-detail cockpit** (`/dashboard/[id]` redesign): a hero (identity + colored status badge + days-open + AI one-liner), a **readiness strip** (`ReadinessStrip.tsx`) that states whether the claim is submittable — red with a **one-click WhatsApp doc chase** (pre-filled with the blocking items + the client's `/c/[token]` upload link) when blocking docs are missing, amber when unclassified, green with an advance-next-milestone button otherwise — a two-column action/controls layout, and collapsible classification + form-field-editor sections. All readiness signals are derived from the existing checklist (no extra I/O). `FormGenerator` insurer options are now server-derived from the `formfill` template registry (`Object.keys(templates)`).
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
- **`waPhone` extracted** into `web/src/lib/wa.ts` (shared by `ReadinessStrip` + the digest; `wa.test.ts`).

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

### Done since last sync (2026-08-05, PR #30 — wizard progress persistence)
- **The collection wizard is resumable.** A client interrupted mid-flow (call, WhatsApp, tab eviction) previously restarted at step 0. New `web/src/lib/collection/persist.ts` (`saveWizardState` / `loadWizardState` / `clearWizardState`, key `claim-wizard:v1:<token>`) writes step + `State` to `localStorage` on every change and restores it in `CollectionWizard`; the save is cleared on successful submit.
- **Traps encoded in the code:** restore runs in an effect **after mount**, not in the `useState` initializer — the server render has no `localStorage` and diverging would break hydration. Keyed **per token** so two claims from the same phone can't bleed together. Uploads with status `uploading`/`error` are dropped on restore (they never reached the server); `done` ones survive because Storage already has them. The saved state is merged over empty+prefill per nested object, so a save from a deploy that predates a field still loads; `VERSION` in the key is the escape hatch for a breaking `State` change.
- **Storage is client-local only** — nothing new server-side, **no migration**, no schema or route change. Note that an abandoned claim leaves PII (name, ID, phone) in the device's `localStorage` until submit; see [architecture.md](architecture.md#5-security--privacy-from-day-one).
- Unit-tested: `web/src/lib/collection/persist.test.ts` (round-trip, per-token isolation, corrupt JSON, wrong shape, upload sanitising, old-save merge, prefill precedence, clear).

---

## To run the AI path live
Add `ANTHROPIC_API_KEY` to `web/.env.local`, then:
```
cd web ; npm run dev
```
→ open `/c/demo` → fill the wizard → review step → **"סכם עם AI"**.

## Pre-deploy gotchas (don't forget)
- ~~Swap the dev font for an OFL font~~ — **done**: `web/src/lib/formfill/assets/app-hebrew.ttf` is now **Noto Sans Hebrew** (OFL 1.1, static Regular; license bundled as `assets/OFL.txt`); all 9 forms re-QA'd under it (phoenix `driver_name` nudged right=558→540 for the wider glyphs).
- This Next.js is **v16** — its `web/AGENTS.md` says read `web/node_modules/next/dist/docs/` before writing Next code (async `params`/`cookies()`/`headers()`).
- Always consult the **`claude-api` skill** before touching Anthropic SDK code.
