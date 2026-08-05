# Digital Claims Assistant — עוזר התביעות הדיגיטלי

AI claims-collection + management system for **Israeli insurance agents**, built with Claude.

> This file is the always-loaded project brief. The `docs/` folder is the **live source of truth** — several docs are updated more often than this brief, so when a detail here disagrees with a doc, trust the doc.

## What it is
A client who had a car accident messages their agent ("עברתי תאונה"). The system runs the full info-collection flow (injuries, car photos, driver's license, vehicle registration, 3rd-party details, event summary), classifies the claim, auto-fills the **"הודעה על תאונה"** (accident-notice) form, and hands the agent an organized, ready-to-handle case file + a status dashboard. Replaces hours of WhatsApp/phone chasing. It is a claim *management* system, not just collection.

## Stage
Validation-first, with a warm design partner (a known insurance agent). Goal: prove agents will **pay** before building heavily. Current status lives in `docs/validation-guide.md` and `docs/assumptions-canvas.md`.

## Stack (approved)
Next.js + TypeScript + Supabase (Postgres/Auth/Storage) + Anthropic Claude SDK + Vercel. Hebrew/RTL from day one. Handles sensitive PII (ID, license) under חוק הגנת הפרטיות.

## Conventions
- **Doc language:** technical docs (`architecture.md`, `flow.md`, `mvp-scope.md`) in **English**; domain/customer docs (`claim-management.md`, `form-field-map.md`, `validation-guide.md`) in **Hebrew**. Keep Hebrew domain terms everywhere ("הודעה על תאונה", "מי אשם", insurer names).
- **When building:** English code identifiers + Hebrew UI strings.
- Primary developer is a senior backend dev — keep explanations concise and peer-level.

## Workflow (Claude sessions)
Standing rule for this repo: **branch + PR per change — never commit to `main` directly.** For each feature/fix you complete, cut a branch off `main` (`feat/…` · `fix/…` · `docs/…` · `chore/…`), commit there, push, and open a PR with `gh pr create`. This is **pre-authorized** — do it without asking each time (`gh` is authed as `eylonbenda`; remote `origin` = `eylonbenda/digital-claims-assistant-`). Opening a PR triggers the **doc-sync** Action, which auto-syncs docs and comments on the PR. **Leave the PR for the user to review/merge — don't self-merge unless asked.** Scope commits tightly; end messages with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer naming the model that wrote it.

## Domain essentials
A claim has 4 tracks (`claim_type`): `own_policy`, `third_party_report` ("דוח פרטי"), `third_party_settlement` ("הסדר"), and `unknown` (default, revisable). AI proposes the classification, the agent confirms. Third-party is the sharpest differentiation. Accident-notice forms are per-insurer but ~80% shared fields, and are flat PDFs (no AcroForm) → fill via **text overlay at coordinates**, not field-fill. Details in `docs/claim-management.md` + `docs/form-field-map.md`.

## Traps (unguessable from the code — remember these)
- **DB migrations are never applied automatically.** Deploying ships code, not schema: every `web/db/migrations/NNN_*.sql` is pasted into the Supabase SQL editor by hand — dev *and* prod. When a change adds one, say so explicitly in the handoff. A forgotten migration deploys green and 500s at runtime. Checklist in `docs/status.md`.
- **Draw Hebrew in logical order — do NOT reverse the string.** pdf-lib + fontkit shape RTL themselves; manual reversal looks right in code and renders as gibberish.
- **Anthropic SDK work → consult the `claude-api` skill first** (model IDs, SDK surface). Never assert model facts from memory.
- **This Next.js is v16** — per `web/AGENTS.md`, read `web/node_modules/next/dist/docs/` before writing Next code.
- `docs/accidentStatementPdf/כלל_טופס_תאונה.pdf` is actually **מנורה**. We have no real כלל form (AIG uses the כלל-group template).

## Docs index
| Doc | Answers |
|---|---|
| `docs/status.md` | **read first when resuming** — where we are + next step, deploy topology, promote-to-prod checklist |
| `docs/mvp-scope.md` | locked MVP scope + build order |
| `docs/flow.md` | claim lifecycle, collection flow, state machine, edge cases |
| `docs/architecture.md` | components, data model (`web/db/schema.sql`), AI design, security — the *why* |
| `docs/app-map.md` | where the code lives + how to run it — module map, API routes, build/assets — the *where* |
| `docs/claim-management.md` | claim tracks, classification, accident-notice form, task workflows |
| `docs/form-field-map.md` | canonical field schema, per-insurer coordinate map, `.pdfwork/` coordinate lab |
| `docs/regulatory-clock.md` | SLA / limitation deadlines that source task due-dates |
| `docs/ai-doc-validation.md` | **spec, not built** — AI vision validation of uploaded documents |
| `docs/validation-guide.md` | Mom Test interview kit |
| `docs/assumptions-canvas.md` | assumption tracker |
| `docs/accidentStatementPdf/` | the 9 source insurer PDFs (inventory + traps in `form-field-map.md`) |
| `poc/README.md` | the original coordinate-mapping method write-up |
