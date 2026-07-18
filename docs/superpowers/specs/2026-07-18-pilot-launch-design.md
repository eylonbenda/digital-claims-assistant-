# Pilot Launch + Follow-ups Digest — Design

**Date:** 2026-07-18 · **Status:** draft for review
**Goal:** two insurance agents pilot the system this week, self-serve, with the auto-filled
"הודעה על תאונה" PDF as the headline value — while development continues on the
claims-management track (task reminders).

## Decisions (made with the user, 2026-07-18)

| Decision | Choice |
|---|---|
| Pilot model | **Deploy to Vercel — agents self-serve** (own logins, real claims, real clients) |
| Environments | **Separate prod Supabase project**; current project stays the dev sandbox |
| Dev track during pilot | **Task reminders** as a follow-ups digest |
| Reminder channel | **Dashboard digest view + pre-filled WhatsApp (`wa.me`) links** — no outbound infra |

## Track A — Pilot launch (critical path)

### A1. Font swap (deploy blocker)
Replace `web/src/lib/formfill/assets/app-hebrew.ttf` (Windows Arial — not licensed for
bundling) with **Noto Sans Hebrew** (OFL; includes Latin + digits — verify at QA).
Templates are coordinate-anchored so origins don't move, but glyph widths differ:
re-render QA fills for **all 9 insurers** with the stress-data harness
(`web/scripts/fill.ts`), inspect centered / wrapped / narrow fields, fix any template
that drifts. Acceptance: all 9 rendered PDFs visually pass, `npm test` + `next build` green.

### A2. Prod Supabase
New Supabase project (pilot data only — real PII under חוק הגנת הפרטיות):
run `web/db/schema.sql`, then migrations `001`–`006` in order (003 creates the private
`claim-docs` bucket), create 3 auth users (owner + 2 pilot agents).
Acceptance: submit flow writes claim + docs + generated form end-to-end against it.

### A3. Vercel deploy
New Vercel project rooted at `web/`; env: prod Supabase URL/anon/service-role +
`ANTHROPIC_API_KEY`. Default `*.vercel.app` domain (custom domain out of scope).
`outputFileTracingIncludes` already bundles PDF/font assets. Production branch = `main`;
PR merges auto-deploy (CI already gates lint/test/build).
Note: the `/c/[token]` no-Supabase demo bypass is inert in prod (env vars present).

### A4. Prod smoke test
On the live URL: login → create claim → open `/c/[token]` on a phone → full wizard incl.
photo upload → submit → auto-filled PDF appears in `/dashboard/[id]` → AI classification
proposal renders → checklist/tasks spawn. Verify `/api/health` and `/api/version`.

### A5. Agent onboarding
Each agent gets: login credentials, the URL, and a short Hebrew "how to open a claim and
send the link" message. Owner shepherds the first claim of each agent (remote), then
hands off. Feedback captured as notes for `docs/validation-guide.md` /
`docs/assumptions-canvas.md`.

## Track B — Follow-ups digest ("מעקבים להיום")

A dashboard view listing every **open task due today or overdue** across the agent's
claims, so the day starts from one screen.

- **Selection:** `tasks` where `status in ('todo','in_progress','blocked')` and
  `due_date <= today`, joined to claims;
  grouped by claim; ordered most-overdue first. Read-only — **no schema change, no cron**.
- **Row:** task title, days-overdue badge, link to `/dashboard/[id]`, and — for
  chase-type tasks (client docs, insurer response) — a pre-filled `wa.me` link reusing
  the `ReadinessStrip` doc-chase pattern. Hebrew message templates per task kind
  (doc chase includes the client's `/c/[token]` link; insurer chase is agent-directed text).
- **Placement:** section at the top of `/dashboard` (collapsed when empty) — not a
  separate route, so agents see it without navigating.
- **Structure:** pure selection/grouping/message-building function in
  `web/src/lib/tasks/` (Vitest-covered, same style as the engine); thin server component
  renders it.

## Working rules for the week

- Branch + PR per change (standing repo rule). CI gates merges; merge = deploy.
- Pilot-agent breakage preempts Track B work.
- Out of scope: email digest, WhatsApp Business API, AI doc-validation, custom domain,
  UX redesign.

## Risks

- **Font drift** (A1) is the main technical risk — mitigated by the existing per-insurer
  QA render harness; worst case a template needs coordinate nudges (done twice before,
  method proven in `poc/README.md`).
- **Mobile wizard on agents' clients' phones** is the least-exercised surface — the smoke
  test (A4) runs on a real phone before onboarding.
