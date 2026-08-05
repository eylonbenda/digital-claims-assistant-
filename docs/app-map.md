# App Map — where the code lives & how to run it

> The **navigation** doc for `web/`: module ownership, route inventory, local setup, build/asset facts.
> *Why* things are designed the way they are lives in [architecture.md](architecture.md) — this doc answers "which file do I open?".

---

## 1. Run it locally
1. Create a Supabase project, run `web/db/schema.sql` in its SQL editor, then apply migrations `001` (agent trigger) and `003` (Storage bucket) separately — see the migration note in [architecture.md](architecture.md#3-data-model-initial-schema).
2. Copy `web/.env.example` → `web/.env.local` and fill the Supabase keys + `ANTHROPIC_API_KEY`.
3. From `web/`: `npm run dev`.

Other scripts: `npm run build` · `npm run lint` · `npm run test` (Vitest, `web/vitest.config.ts`).
Deploy topology (prod vs. preview Supabase projects) and the promote-to-prod checklist live in [status.md](status.md).

---

## 2. Surfaces (`web/src/app/`)
| Route | Who | What |
|---|---|---|
| `/` | public | marketing landing page ("OpenTik"), Hebrew/RTL |
| `/login` | agent | Supabase Auth sign-in |
| `/c/[token]` | client | token-gated collection wizard (no login) |
| `/dashboard` | agent | claim list + **morning brief** ("תדריך בוקר") |
| `/dashboard/[id]` | agent | claim **cockpit** — hero, readiness strip, checklist, tasks, docs, notes, form generator |

---

## 3. Module map (`web/src/lib/`)
| Module | Owns |
|---|---|
| `formfill/` | canonical claim schema (`types.ts`) → filled insurer PDFs: generic `engine.ts`, all 9 coordinate `templates/`, `effective.ts` (agent edits win over client input), `dates.ts` (ISO → dd/mm/yyyy at the fill boundary), bundled `assets/` |
| `claims/` | `classify.ts` (deterministic track decision), `checklist.ts` (`computeChecklist`), `analysis-cache.ts` |
| `tasks/` | task engine: pure `engine.ts` (`advanceTasks`), declarative `templates.ts` rule table, `runner.ts` (`runEngine`, best-effort) |
| `brief/` | morning brief: `facts.ts` → `score.ts` (deterministic) → `rank.ts` (AI tier) → `brief.ts` (`getOrCreateBrief`) |
| `ai/` | `analyze.ts` — the single structured Claude call (signals only, never the track) |
| `collection/` | `claim-state.ts` — shared wizard↔server mapping (`State` + `toClaimData`); `persist.ts` — per-token `localStorage` save/restore of wizard progress |
| `files/` | `sniff.ts` — magic-byte upload validation |
| `supabase/` | client/server/service-role clients |
| `wa.ts` | wa.me links + Hebrew chase copy (`waPhone`, `chaseMessage`, `chaseHref`) |
| `anthropic.ts` | SDK client construction |

Behaviour of the classifier, checklist, task engine and brief is specified in [architecture.md](architecture.md) §3–§4 and [claim-management.md](claim-management.md) — this table is only "where".

---

## 4. API routes (`web/src/app/api/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/claims` | GET/POST | agent claim list / create |
| `/api/claims/submit` | POST | client submits the wizard → auto-fills the accident notice |
| `/api/claims/documents` | POST | **client** upload (magic-byte sniffed) |
| `/api/claims/[id]/documents` | POST | **agent** upload with a type tag |
| `/api/claims/[id]/classify` | PATCH | agent confirms the track |
| `/api/claims/[id]/checklist` | PATCH | tick a milestone |
| `/api/claims/[id]/tasks` · `/tasks/[taskId]` | POST · PATCH | ad-hoc agent tasks (`source='manual'`) |
| `/api/claims/[id]/notes` | POST | append to the agent scratchpad |
| `/api/claims/[id]/form-data` | PATCH | agent edits the canonical form fields |
| `/api/claims/[id]/form/[insurer]` | GET | on-demand fill for one insurer |
| `/api/forms/[insurer]` | POST | fill a PDF from a canonical claim body |
| `/api/analyze` | POST | Claude analysis — **503 without `ANTHROPIC_API_KEY`** |
| `/api/brief/refresh` | POST | re-run the morning-brief ranking |
| `/api/auth/login` · `/api/auth/logout` | POST | session |
| `/api/health` · `/api/version` | GET | which keys are wired · app name + version |

The mutation routes (`submit`, `classify`, `checklist`, `documents`) each call `runEngine` inline, best-effort.

---

## 5. Build & assets
- **Next.js 16** + TypeScript + Tailwind v4, RTL. `next build` passes.
- Hebrew font `web/src/lib/formfill/assets/app-hebrew.ttf` = **Noto Sans Hebrew** static Regular (OFL 1.1, license bundled as `assets/OFL.txt`). All 9 forms QA'd under it.
- Prod asset bundling for the PDF templates/font is configured via `outputFileTracingIncludes` in `web/next.config.ts` — add new bundled assets there or they vanish on Vercel.
- QA a fill locally with `web/scripts/fill.ts` (uses `formfill/sample-claim.ts`).
- Env override: `CLAIMS_AI_MODEL` swaps the analysis model tier.
