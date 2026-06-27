# Status & Next Steps

> **Session breadcrumb** — read this first when resuming. Last updated **2026-06-27**.
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
| 3 | Collection web-app | ✅ done — `web/src/components/collection/CollectionWizard.tsx` (9-step RTL wizard). Submit now calls `POST /api/claims/submit` for real persistence. |
| 4 | AI processing | ✅ done — `POST /api/analyze` → `web/src/lib/ai/analyze.ts`. Wired into the wizard's review step. |
| 5 | Form overlay fill | ✅ engine + templates done — dynamic `GET /api/forms/[insurer]` previews a filled PDF (demo claim) + `POST` fills from a claim body; insurers wired: הכשרה, מגדל, מנורה (verified end-to-end). **Not yet written to `generated_forms`** (needs persistence). Remaining insurer templates + OCR for הפניקס/איילון deferred. |
| 6 | Static per-track checklist | ❌ not started |
| 7 | Basic dashboard | ✅ **done** — `web/src/app/dashboard/page.tsx`: claims list + new-claim form + logout. Feeds from Supabase RLS. **Needs Supabase keys to go live.** |
| 8 | UX polish + run with design partner | ❌ not started |

**In one line:** everything is built end-to-end. The system is blocked only on Supabase provisioning.

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
3. Run `web/db/migrations/001_agent_setup.sql` (agent trigger + insert policy), then `web/db/migrations/002_grants.sql` (PostgREST grants — without these, writes fail even with the service-role key)
4. Copy keys into `web/.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   ```
5. Create a test agent user in Supabase Auth (Dashboard → Authentication → Users → Invite / Add user)
6. `cd web && npm run dev` → go to `/login` → create a claim → send link → fill wizard → see it appear in dashboard

### After Supabase is live — remaining work
- **Form persistence**: write generated PDFs to `generated_forms` table + Supabase Storage
- **Photo upload**: wire the wizard's photo step to Supabase Storage
- **Per-track checklist** (step 6): `claim_type` → required docs/steps config
- **UX polish** (step 8): design partner run

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
