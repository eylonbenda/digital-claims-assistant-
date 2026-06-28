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

## Domain essentials
A claim has 4 tracks (`claim_type`): `own_policy`, `third_party_report` ("דוח פרטי"), `third_party_settlement` ("הסדר"), and `unknown` (default, revisable). AI proposes the classification, the agent confirms. Third-party is the sharpest differentiation. Accident-notice forms are per-insurer but ~80% shared fields, and are flat PDFs (no AcroForm) → fill via **text overlay at coordinates**, not field-fill. Details in `docs/claim-management.md` + `docs/form-field-map.md`.

## Docs index
- `docs/status.md` — **read first when resuming**: where we are + next step (session breadcrumb)
- `docs/mvp-scope.md` — locked MVP scope + build order
- `docs/flow.md` — claim lifecycle, collection flow, state machine, edge cases
- `docs/architecture.md` — components, data model, AI design, security
- `docs/claim-management.md` — claim tracks, classification, accident-notice form, task workflows
- `docs/form-field-map.md` — canonical field schema + per-insurer coordinate mapping
- `docs/validation-guide.md` — Mom Test interview kit
- `docs/assumptions-canvas.md` — assumption tracker
- `docs/ai-doc-validation.md` — **spec** (not built): AI vision validation of uploaded claim documents
- `docs/accidentStatementPdf/` — 9 insurer accident-notice PDFs (source). `.pdfwork/` — pdfjs-dist extraction script + extracted text. 9 forms analyzed (7 text-extractable; הפניקס + איילון need OCR; the `כלל_טופס_תאונה.pdf` file is actually מנורה). Full map in `docs/form-field-map.md`.
- `web/src/lib/formfill/` — form-fill module (✅ **schema-driven, single source of truth**): one canonical claim (`types.ts`) → per-insurer PDFs via a generic engine + coordinate templates (done: הכשרה, מגדל, מנורה). `.pdfwork/` is the **coordinate lab** (extraction tools `coords.mjs` / `boxdetect.mjs` / `inspect.mjs` + mupdf `render.mjs`); the `pdf-form-mapper` agent authors app templates and QA-renders via `web/scripts/fill.ts`. **Key lesson: draw Hebrew in logical order — do NOT reverse** (pdf-lib + fontkit shape RTL). Full method in `poc/README.md`.
- `web/` — the **MVP app** (Next.js 16 + TS + Tailwind v4, RTL; Supabase + Anthropic SDK installed). `web/db/schema.sql` = full data model + RLS. `web/.env.example` lists required keys. **`next build` passes.** To run: create a Supabase project, run the schema, put keys + `ANTHROPIC_API_KEY` in `web/.env.local`, then `npm run dev` in `web/`. The **form-fill module is ported into the app** (`web/src/lib/formfill/`: generic `engine.ts` + canonical `types.ts` + הכשרה/מגדל/מנורה templates + bundled assets); a dynamic `GET /api/forms/[insurer]` route previews a filled PDF from a demo claim and `POST /api/forms/[insurer]` fills from a canonical claim body (insurers: hachshara, migdal, menora; verified end-to-end). A `GET /api/health` route reports which keys are wired. Font `assets/app-hebrew.ttf` is Windows Arial for dev — **swap for an OFL font (Rubik/Heebo/Noto Sans Hebrew) before deploy**. Asset bundling for prod is set via `outputFileTracingIncludes` in `next.config.ts`. **AI processing**: `POST /api/analyze` (`web/src/lib/ai/analyze.ts`) sends collected `ClaimData` to Claude (`claude-opus-4-8`, adaptive thinking, structured `output_config.format`) → `{summary, missing, proposed_claim_type, rationale}`, wired into the collection wizard's review step. Guarded — returns 503 without `ANTHROPIC_API_KEY`; model overridable via `CLAIMS_AI_MODEL`. **Always consult the `claude-api` skill before adding/editing Anthropic SDK code** (model IDs, SDK surface). Note: this Next.js is v16 — its `AGENTS.md` says read `web/node_modules/next/dist/docs/` before writing Next code.
