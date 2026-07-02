# Status & Next Steps

> **Session breadcrumb** — read this first when resuming. Last updated **2026-07-02**.
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
| 4 | AI processing | ✅ **done + upgraded** — `POST /api/analyze` → `web/src/lib/ai/analyze.ts`. Now a **two-layer classifier** (see below): LLM extracts narrative signals, deterministic rules pick the track. Result lazy-cached in `claims.summary_json.analysis`. |
| 5 | Form overlay fill | ✅ **done + persisted** — `GET/POST /api/forms/[insurer]` (preview/fill). Insurers wired: הכשרה, מגדל, מנורה. **Now written to `generated_forms` + Storage**: auto-filled at submit from the claimant's insurer, and `GET /api/claims/[id]/form/[insurer]` (agent, RLS-gated) regenerates on demand (latest-per-insurer). Remaining insurer templates + OCR for הפניקס/איילון deferred. |
| 6 | Per-track checklist | ✅ **done** — dynamic per-track checklist engine `web/src/lib/claims/checklist.ts` (mandatory/conditional × blocking/non-blocking, `policy_activated` fork). UI `ChecklistPanel.tsx` + agent late-upload `AgentDocUpload.tsx`; milestone ticks via `PATCH /api/claims/[id]/checklist`. Auto-checks against uploaded docs. |
| 7 | Basic dashboard | ✅ **done** — `web/src/app/dashboard/page.tsx` (claims list) + **`/dashboard/[id]` claim detail**: uploaded docs (signed-URL previews + zoom) and the filled accident-notice form. Feeds from Supabase RLS. **Needs Supabase keys to go live.** |
| 8 | UX polish + run with design partner | ❌ not started |

**In one line:** everything is built end-to-end incl. document upload + form persistence + agent-side surfacing + **dynamic per-track checklist** + **two-layer claim classifier**. Blocked only on Supabase provisioning (run migrations `003` **and now `004`**).

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
3. Run `web/db/migrations/001_agent_setup.sql` (agent trigger + insert policy), then `web/db/migrations/002_grants.sql` (PostgREST grants — without these, writes fail even with the service-role key), then `web/db/migrations/003_storage.sql` (creates the private `claim-docs` bucket — without it, document upload + form persistence fail with "Bucket not found")
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

### Remaining work
- **AI doc-validation** (spec only — `docs/ai-doc-validation.md`): is the uploaded file actually a driver's license? Phase 1 = classify-only warning.
- **Remaining insurer templates**: shlomo/libra/harel/aig (+ OCR for הפניקס/איילון) via the `pdf-form-mapper` agent.
- **Regulatory clock** (optional, deferred this session): SLA fields `sla_clock_started_at` / `decision_due_at` + dashboard surfaces (`docs/regulatory-clock.md`).
- **UX polish** (step 8): design partner run.

### Built this session (2026-07-01 → 02)
**Doc-type split + dynamic checklist + two-layer classifier.** ⚠️ **Run migration `web/db/migrations/004_doc_types_and_claim_flags.sql`** (11 new `doc_type` enum values; `theft`/`lien`/`business_use`/`policy_activated`/`garage_network_rider` flags on `claims`).

| File | What |
|---|---|
| `web/db/migrations/004_doc_types_and_claim_flags.sql` | Enum expansion (invoice≠receipt, loss≠no-claim, etc.) + circumstance flags |
| `web/src/lib/claims/checklist.ts` | Per-track checklist engine (mandatory/conditional × blocking) + `policy_activated` fork |
| `web/src/app/dashboard/[id]/ChecklistPanel.tsx` | Grouped checklist UI, blocking-missing banner, milestone toggles |
| `web/src/app/dashboard/[id]/AgentDocUpload.tsx` | Agent late-document upload (wider type set) |
| `web/src/app/api/claims/[id]/documents/route.ts` | Agent-authed upload (session + RLS, 20MB) |
| `web/src/app/api/claims/[id]/checklist/route.ts` | `PATCH` milestone tick → `checklist_state` |
| `web/src/lib/claims/classify.ts` | **Two-layer classifier** — deterministic Layer-1 tree (fault × TP-identified × coverage), Layer-2 = agent choice. Unit-tested (12 cases). |
| `web/src/lib/ai/analyze.ts` | LLM now extracts **narrative signals** (`incident_kind`, `inferred_fault`) only; classifier owns the enum. Richer `ClaimAnalysis` (confidence, viability_warning, fault mismatch). |
| `web/src/lib/claims/analysis-cache.ts` | Lazy cache → `claims.summary_json.analysis` + input-hash invalidation |
| `web/src/app/dashboard/[id]/ClaimTypeConfirm.tsx` | Confidence-gated confirm UI (forces report/settlement choice) |
| `web/src/app/api/claims/[id]/classify/route.ts` | `PATCH` confirm/override `claim_type` → status `classified` |
| `web/src/lib/collection/claim-state.ts` + `CollectionWizard.tsx` | Collect `insurance_type` (מקיף/חובה/צד ג') — the missing viability pivot |
| `docs/claim-management.md` | §1 rewritten as the two-layer model (see there for the decision tree) |

### Context updated (2026-06-30)
Deep research review applied to all docs. Key additions:
- `docs/regulatory-clock.md` — new file; SLA + limitation constants.
- `docs/architecture.md` — expanded `claim_documents` type enum (+8 types, invoice≠receipt split); new entities (garages, assessors, witnesses, injured\_persons, payments); new `claims` fields (coverage\_type, lien, business\_use, theft, policy\_activated, sla\_clock\_started\_at, decision\_due\_at, limitation\_deadline); OCR vendor note; compliance additions.
- `docs/claim-management.md` — checklist mandatory/conditional/blocking model; conditional rules per circumstance; residual-loss fork note; demand\_letter + submission\_packet as generated outputs; regulatory-clock section.
- `docs/flow.md` — bodily-injury scope boundary; SLA time dimension; 3-screen dashboard model; 6 new edge cases.
- `docs/mvp-scope.md` — "Candidates" table (clock widget, conditional checklist, demand letter, WhatsApp channel).
- `docs/ai-doc-validation.md` — OCR vendor decision (Vision/Azure not Textract); HITL critical fields; per-doc accuracy KPIs.
- `docs/assumptions-canvas.md` — new assumptions C4, R1, K1, V7; decision log entry.

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
