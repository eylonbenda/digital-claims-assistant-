# Status & Next Steps

> **Session breadcrumb** — read this first when resuming. Last updated **2026-07-05**.
> Source of truth is still the individual docs; this is just "where we are + what's next" so a fresh session can pick up without a recap.

## How to resume
```
cd C:\Users\eylon\digital-claims-assistant   # launch from here so CLAUDE.md auto-loads
claude
```
Then read this file + `CLAUDE.md`. The work lives in the repo, not in chat history.

---

## Where we are (mapped to the build order in [mvp-scope.md](mvp-scope.md))

| # | Step | State |
|---|---|---|
| 1 | Scaffold (Next 16 + TS + Tailwind v4, RTL) | ✅ done — `web/`. **Not yet deployed to Vercel.** |
| 2 | Data model + agent Auth + claim creation + link | ✅ **done** (pending Supabase provisioning) — schema + RLS in `web/db/schema.sql`; migrations in `web/db/migrations/` (001 agent setup, 002 PostgREST grants); auth routes + middleware + dashboard written. **Needs real Supabase keys in `web/.env.local`.** |
| 3 | Collection web-app | ✅ done — `web/src/components/collection/CollectionWizard.tsx` (10-step RTL wizard, incl. **own-insurer select** + **document-upload step**). Submit calls `POST /api/claims/submit`. |
| 4 | AI processing | ✅ done — `POST /api/analyze` → `web/src/lib/ai/analyze.ts`. **Now a two-layer classifier**: the LLM emits narrative signals only; a deterministic `web/src/lib/claims/classify.ts` owns the track + confidence. Analysis cached in `summary_json.analysis`. Wired into the wizard's review step + agent detail page. |
| 5 | Form overlay fill | ✅ **done + persisted** — `GET/POST /api/forms/[insurer]` (preview/fill). Insurers wired: הכשרה, מגדל, מנורה. **Now written to `generated_forms` + Storage**: auto-filled at submit from the claimant's insurer, and `GET /api/claims/[id]/form/[insurer]` (agent, RLS-gated) regenerates on demand (latest-per-insurer). **Agent can now edit/complete the canonical form fields** (`FormFieldEditor` → `PATCH /api/claims/[id]/form-data`, stored in `summary_json.form_data`; `effectiveClaimData` prefers it, client `collected` left untouched). Remaining insurer templates + OCR for הפניקס/איילון deferred. |
| 6 | Per-track checklist | ✅ **done** — dynamic per-track config `web/src/lib/claims/checklist.ts` (base/late/conditional/milestone sections; doc items auto-check from `claim_documents`, milestones tick via `PATCH /api/claims/[id]/checklist`, conditional items driven by circumstance flags — migration `004`). Agent uploads later docs via `POST /api/claims/[id]/documents`; confirms track via `PATCH /api/claims/[id]/classify`. Rendered on `/dashboard/[id]`. |
| 7 | Basic dashboard | ✅ **done** — `web/src/app/dashboard/page.tsx` (claims list) + **`/dashboard/[id]` claim-detail cockpit**: hero (identity + status badge + days-open + AI one-liner), a **readiness strip** (blocking-docs-or-not, with a one-click **WhatsApp doc chase** / advance-next-milestone), proposed classification (confidence + rationale, collapsed once confirmed), the checklist panel, agent doc upload, the filled accident-notice form (insurer options now server-derived from the `formfill` template registry), collapsible form-field editor, and an **agent notes** scratchpad (`claim_notes`, `POST /api/claims/[id]/notes`, migration `005`). Feeds from Supabase RLS. **Needs Supabase keys to go live.** |
| 8 | UX polish + run with design partner | ❌ not started |

**In one line:** the full pipeline is built end-to-end — collection + upload + two-layer classification + form persistence + dynamic per-track checklist + agent surfacing. Blocked only on Supabase provisioning (run migrations `001`–`005`, incl. the `claim-docs` bucket).

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
3. Run `web/db/migrations/001_agent_setup.sql` (agent trigger + insert policy), then `web/db/migrations/002_grants.sql` (PostgREST grants — without these, writes fail even with the service-role key), then `web/db/migrations/003_storage.sql` (creates the private `claim-docs` bucket — without it, document upload + form persistence fail with "Bucket not found"), then `web/db/migrations/004_doc_types_and_claim_flags.sql` (expands the `doc_type` enum + adds the circumstance-flag columns the checklist reads), then `web/db/migrations/005_claim_notes.sql` (the `claim_notes` table backing the agent-notes scratchpad), then `web/db/migrations/006_tasks_engine.sql` (task-engine columns + idempotency index on `tasks`)
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

### Remaining work
- **AI doc-validation** (spec only — `docs/ai-doc-validation.md`): is the uploaded file actually a driver's license? Phase 1 = classify-only warning.
- **Remaining insurer templates**: shlomo/libra/harel/aig (+ OCR for הפניקס/איילון) via the `pdf-form-mapper` agent.
- **UX polish** (step 8): design partner run.

---

## To run the AI path live
Add `ANTHROPIC_API_KEY` to `web/.env.local`, then:
```
cd web ; npm run dev
```
→ open `/c/demo` → fill the wizard → review step → **"סכם עם AI"**.

## Pre-deploy gotchas (don't forget)
- **Swap the dev font** `web/src/lib/formfill/assets/app-hebrew.ttf` (Windows Arial) for an **OFL font** (Rubik / Heebo / Noto Sans Hebrew) before shipping — licensing.
- This Next.js is **v16** — its `web/AGENTS.md` says read `web/node_modules/next/dist/docs/` before writing Next code (async `params`/`cookies()`/`headers()`).
- Always consult the **`claude-api` skill** before touching Anthropic SDK code.
