# App Map — where the code lives & how to run it

> The **navigation** doc for `web/`: module ownership, route inventory, local setup, build/asset facts.
> *Why* things are designed the way they are lives in [architecture.md](architecture.md) — this doc answers "which file do I open?".

---

## 1. Run it locally
1. Create a Supabase project, run `web/db/schema.sql` in its SQL editor, then apply migrations `001` (agent trigger) and `003` (Storage bucket) separately — see the migration note in [architecture.md](architecture.md#3-data-model-initial-schema).
2. Copy `web/.env.example` → `web/.env.local` and fill the Supabase keys + `ANTHROPIC_API_KEY`.
3. From `web/`: `npm run dev`.

Other scripts: `npm run build` · `npm run lint` · `npm run test` (Vitest, `web/vitest.config.ts`) · `npm run brand` · `npm run brand:wordmark` · `npm run test:brand` (brand assets — see §5) · `npm run check:rls` / `npm run test:rls` (`web/scripts/check-rls.mjs` — fails on any `public` table missing `enable row level security`; see [architecture.md](architecture.md#5-security--privacy-from-day-one)). `npm run test:scripts` (migration-guard unit tests — see §5).
Deploy topology (prod vs. preview Supabase projects) and the promote-to-prod checklist live in [status.md](status.md).

---

## 2. Surfaces (`web/src/app/`)
| Route | Who | What |
|---|---|---|
| `/` | public | marketing landing page ("OpenTik"), Hebrew/RTL |
| `/login` | agent | Supabase Auth sign-in |
| `/c/[token]` | client | token-gated collection wizard (no login) |
| `/dashboard` | agent | **one list** — `TodayList`, one card per open claim; brief + queue are folded in as data, not as their own panels — + a searchable archive claims table. **Default view is intake-first** (flat, ordered by latest activity — link created, client submitted, or a document uploaded, whichever is newest — with a "חדש"/"מסמך חדש" badge in the last day); `RefreshOnFocus.tsx` (client, `router.refresh()` on tab-visible/focus, throttled to once a minute) picks up activity that lands while the tab sits open. The sectioned צריך אותך / בהמתנה / תקינים view + the AI brief only render when `briefEnabled()` (`web/src/lib/dashboard/flags.ts`, `BRIEF_ENABLED=1`) is on — off by default since 2026-09-27. With the brief off, no model call, no day-cache read, and no `after()` warm; when it's on, a cold brief cache renders the rules-only ordering immediately, warms the AI ranking after the response via `after()`, and mounts `BriefAutoRefresh.tsx` (client, `router.refresh()` scheduled at 55s and 115s on mount) to pick it up |
| `/dashboard/[id]` | agent | claim **cockpit** — a persistent header (identity + one primary next action) over **4 tabs**: סקירה / עבודה על התיק / טופס ההודעה / קבצים (active tab mirrored in `?tab=`) |

`web/src/app/global-error.tsx` — last-resort screen when the root layout itself throws (client component, brings its own `<html>`/`<body>`); the error itself is reported server-side via `instrumentation.ts`, not here.

The client wizard's own files live in `web/src/components/collection/`: `steps.ts` (the step registry — order, chapters, relevance, completeness; the single source of truth for position), `CollectionWizard.tsx` (state, navigation, uploads, submit), `WizardShell.tsx` (chapter chips / dots / nav chrome + the milestone screen), one component per step under `steps/` with shared inputs in `steps/fields.tsx`, and `FollowupUpload.tsx` (the post-submit upload screen).

---

## 3. Module map (`web/src/lib/`)
| Module | Owns |
|---|---|
| `formfill/` | canonical claim schema (`types.ts`) → filled insurer PDFs: generic `engine.ts`, all 11 coordinate `templates/`, `effective.ts` (agent edits win over client input), `dates.ts` (ISO → dd/mm/yyyy at the fill boundary), bundled `assets/` |
| `claims/` | `classify.ts` (deterministic track decision), `checklist.ts` (`computeChecklist` + `chaseableLabels`), `analysis-cache.ts` (`readCachedAnalysis`/`needsAnalysis` for render paths — never call the model; `warmAnalysis` fills a cold cache off-render, called from submit and from a cold cockpit view), `milestone-dates.ts` (`milestoneDates` — folds `claim_events` `milestone_ticked` rows into a date per checklist milestone; not yet read by any route) |
| `tasks/` | task engine: pure `engine.ts` (`advanceTasks`), declarative `templates.ts` rule table, `runner.ts` (`runEngine`, best-effort) |
| `brief/` | morning brief: `facts.ts` → `score.ts` (deterministic) → `rank.ts` (AI tier) → `brief.ts` (`getOrCreateBrief`, `{cachedOnly}` for render paths — never blocks on the model; `warmBriefRanking` fills a cold cache off-render) |
| `outbound/` | outbound queue: `rules.ts` (per-task-key send descriptors + cooldowns + the `auto` flip-to-send seam + a presentation-only `labels()` beside `build()`), pure `queue.ts` (`buildQueue` — lanes, cooldown, one-per-claim-per-day cap, give-up escalation, ordering), `load.ts` (`loadQueue`, the only I/O, best-effort) |
| `dashboard/` | the `/dashboard` index view model: pure `compose.ts` (`composeDashboard` — claims ⊕ queue ⊕ brief ⊕ open tasks → one `ClaimCard` per claim, each carrying `activity_at` (latest of created/submitted/last-upload) and `fresh` (`"submitted"` / `"upload"` / `null`, within a day); returns both `cards` — every open claim ordered by `activity_at` descending, the intake-first default — and the brief-driven `attention` / `waiting` / `ok` split, so the page picks one), `flags.ts` (`briefEnabled()` — reads `BRIEF_ENABLED`, server-only), and pure `copy.ts` (the Hebrew language layer: greeting, date, track labels, action/וגם/waiting lines). `compose.ts`/`copy.ts` unit-tested |
| `cockpit/` | the `/dashboard/[id]` view model: pure `derive.ts` (`deriveCockpit` — page data → one primary next action by precedence + per-tab badges, caller passes `now`) and pure `copy.ts` (its Hebrew lines, reusing `dashboard/copy.ts` idioms). Both unit-tested |
| `ai/` | `analyze.ts` — the single structured Claude call (signals only, never the track) |
| `collection/` | `claim-state.ts` — shared wizard↔server mapping (`State` + `toClaimData`); `persist.ts` — per-token `localStorage` save/restore of wizard progress, keyed by step **key** (`claim-wizard:v2:<token>`, with best-effort migration of a v1 numeric-step blob), plus `draftToSaved` — the shape-checked fallback that rebuilds the same `{stepKey, state}` from the server-synced `summary_json.draft`; `funnel.ts` — pure `summarizeFunnel` over existing `claims` rows (links sent / two completion rates / where abandoned sessions stopped / doc-deferral counts; `never_started` nests inside `abandoned`, so `completion_rate_of_started` is the wizard-only measure), read by `/api/reports/funnel`; `recipient.ts` — client-facing "who gets your details" copy (names the `agents.name` business when known, else segment-neutral wording — never assumes "הסוכן") |
| `vehicles/` | `registry.ts` — plate lookup against the Ministry of Transport open-data registry (data.gov.il): `lookupVehicle` + the pure `toVehicleInfo` / `mergeVehicleInfo` / plate helpers |
| `files/` | `sniff.ts` — magic-byte upload validation |
| `observability/` | `report.ts` — `reportError`/`serverError`: one structured log line per server failure + an optional push alert (`ALERT_WEBHOOK_URL`, production-only, 5-min cooldown per route); wired from route handlers and from `web/src/instrumentation.ts` (`onRequestError`, catches uncaught server errors) |
| `supabase/` | client/server/service-role clients |
| `wa.ts` | wa.me links + Hebrew chase copy (`waPhone`, `waHref`, `chaseMessage`, `chaseHref`, `getTpInsurerMessage`, `collectPrivateReportMessage`) |
| `anthropic.ts` | SDK client construction |

Behaviour of the classifier, checklist, task engine and brief is specified in [architecture.md](architecture.md) §3–§4 and [claim-management.md](claim-management.md) — this table is only "where".

---

## 4. API routes (`web/src/app/api/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/claims` | GET/POST | agent claim list / create |
| `/api/claims/submit` | POST | client submits the wizard → auto-fills the accident notice. Compare-and-set on the claim's status, so of two racing submits exactly one wins; the other (and a retry) gets `409` with a machine-readable `already_submitted` code the wizard treats as success. `503` in production when Supabase isn't configured — never a fake `{ok:true}` for data that wasn't stored. After the response it warms the AI analysis cache (`after()` → `warmAnalysis`) so the agent's first cockpit view doesn't wait on the model |
| `/api/claims/draft` | POST | **client** in-progress wizard state by token → merged into `summary_json.draft` (64 KB cap, `409` once the claim is submitted — compare-and-set on status closes the race with a concurrent submit — `{ok:true, demo:true}` outside production when Supabase isn't configured, `503` in production) |
| `/api/claims/documents` | POST | **client** upload (magic-byte sniffed); `503` in production when Supabase isn't configured (demo `{ok:true}` only outside production) |
| `/api/claims/[id]/documents` | POST | **agent** upload with a type tag |
| `/api/claims/[id]/classify` | PATCH | agent confirms the track |
| `/api/claims/[id]/checklist` | PATCH | tick a milestone |
| `/api/claims/[id]/tasks` · `/tasks/[taskId]` | POST · PATCH | ad-hoc agent tasks (`source='manual'`) |
| `/api/claims/[id]/notes` | POST | append to the agent scratchpad |
| `/api/claims/[id]/form-data` | PATCH | agent edits the canonical form fields |
| `/api/claims/[id]/form/[insurer]` | GET | on-demand fill for one insurer |
| `/api/vehicle/[plate]` | GET | **client** plate → make/model/year from the Ministry of Transport registry (server-side proxy, per-instance memo, `200 {vehicle:null}` on a miss) |
| `/api/reports/funnel` | GET | **agent** wizard funnel (`?days=N`, default 90, max 365) — links sent, `completion_rate` (of all links) vs `completion_rate_of_started` (excludes never-opened links — the wizard-only measure), where abandoned sessions stopped, doc-deferral counts; RLS-scoped, reads existing `claims` rows only, no new table |
| `/api/brief/refresh` | POST | re-run the morning-brief ranking |
| `/api/outbound/events` | POST | record one outbound-queue decision (`sent` / `skipped`) — rejects an unknown `task_key`, RLS ownership probe on the claim, service-role insert into `outbound_events` |
| `/api/auth/login` · `/api/auth/logout` | POST | session |
| `/api/health` | GET | public schema-drift check: `200 {ok, configured, schema:{expected, actual, status}}` when `public.schema_migrations` has every migration the build was made with (`EXPECTED_SCHEMA_VERSIONS`, baked in `next.config.ts` from `web/db/migrations/`); **503** when behind (`missing:[…]`), table missing, or DB unreachable. No Supabase env → 200 `status:"skipped"` locally, 503 on Vercel production. Logic: `web/src/lib/schema-version.ts`. Curled by `.github/workflows/post-deploy-health.yml` |
| `/api/version` | GET | live build: `{commit (short VERCEL_GIT_COMMIT_SHA, "local" off-Vercel), env (VERCEL_ENV), expectedSchema}` |

The mutation routes (`submit`, `classify`, `checklist`, `documents`) each call `runEngine` inline, best-effort.

---

## 5. Build & assets
- **Next.js 16** + TypeScript + Tailwind v4, RTL. `next build` passes.
- Hebrew font `web/src/lib/formfill/assets/app-hebrew.ttf` = **Noto Sans Hebrew** static Regular (OFL 1.1, license bundled as `assets/OFL.txt`). Every template renders under it; the original 9 were explicitly re-QA'd at the font swap (כלל + שומרה were mapped later, under the same font).
- Prod asset bundling for the PDF templates/font is configured via `outputFileTracingIncludes` in `web/next.config.ts` — add new bundled assets there or they vanish on Vercel.
- QA a fill locally with `web/scripts/fill.ts` (uses `formfill/sample-claim.ts`).
- Env override: `CLAIMS_AI_MODEL` swaps the analysis model tier.
- **Brand assets** live in `web/public/brand/`; the **SVG masters are the source of truth**. `npm run brand` (`web/scripts/build-brand-assets.mjs`) rasterizes every PNG from them and writes the multi-size `web/src/app/favicon.ico` (16/32/48, PNG-in-ICO) — **never hand-edit a generated PNG**, re-run the script. `npm run brand:wordmark` (`scripts/gen-wordmark.mjs`) regenerates the outlined wordmark/lockup SVGs (text is outlined so rendering needs no font). Rasterizing uses **`sharp` 0.34.5**, which resolves as an *optional transitive* dep of Next — it is not declared in `web/package.json`.
- `npm run test:brand` runs `node --test scripts/__tests__/brand-assets.test.mjs` (asserts master-SVG invariants + rendered PNG sizes) — a **separate runner from Vitest**, so `npm run test` does not cover it. `npm run test:rls` runs the sibling `scripts/__tests__/check-rls.test.mjs` the same way (own script, not a glob, since both now live under `scripts/__tests__/`).
- `npm run test:scripts` runs `scripts/__tests__/migration-guard.test.mjs` (unit tests for `.github/scripts/migration-guard.cjs`) the same way.
- `next.config.ts` reads `web/db/migrations/` at build time to bake `EXPECTED_SCHEMA_VERSIONS`/`EXPECTED_SCHEMA_VERSION` env vars (see [status.md](status.md) schema-drift check) — the build throws if the directory has no `NNN_*.sql` files.
- Favicon + apple-touch icons are declared in `metadata.icons` (`web/src/app/layout.tsx`); the OG card (`/brand/og-image.png`, 1200×630) in the landing page's `metadata.openGraph` (`web/src/app/page.tsx`), whose header renders the `/brand/logo.svg` lockup.
