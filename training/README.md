# Training videos

Scripted, re-recordable walkthrough videos for the people who use the system. A video is the
output of a script: Playwright drives the **real app** on fictional demo data, records it, and
ffmpeg renders an `.mp4` with Hebrew captions. When the UI changes, re-run the command.

Design and rationale: [`docs/superpowers/specs/2026-11-18-training-videos-design.md`](../docs/superpowers/specs/2026-11-18-training-videos-design.md).

| Video | Scene file | Shows |
|---|---|---|
| `01-accident-notice` | `videos/01-accident-notice.ts` | open a claim → send the link → the client's side (phone) → the filled accident notice |
| `00-smoke` | `videos/00-smoke.ts` | 7-second check that login, recording and rendering work |

## Record a video

1. **One-time setup**
   ```bash
   cd training
   npm install
   npx playwright install chromium
   ```
   Copy `.env.example` to `.env.local` and fill it in. `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are the **dev** project's (the same values as
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in `web/.env.local`). For the demo
   agent, use an email that has **no account yet** and a strong password: the first run
   creates that user in dev and stamps it as the tool's own. The seed refuses to touch an
   existing account that lacks the stamp, so it can never take over a real login.
   Set `PROD_SUPABASE_URL` to the production project's URL so the tool can refuse it (or,
   if you do not have it at hand, repeat the dev URL in `CONFIRMED_DEV_SUPABASE_URL`).
   Without one of the two the tool will not run.

2. **Start the app** against the dev database, and point `BASE_URL` at it.
   - Main checkout: `cd web && npm run dev` → `BASE_URL=http://localhost:3000`.
   - From a worktree (a second `next dev` is refused while one is running): copy
     `web/.env.local` in, then `npm ci && npm run build && npm run start -- --port 3105`.

3. **Record**
   ```bash
   npm run record -- 01-accident-notice
   ```
   The result is `training/out/01-accident-notice.mp4` (git-ignored). About 4 minutes of
   wall time for a 3-minute video.

## What a run does

1. **Guards the target** — refuses unless `BASE_URL` is localhost, the app does not report
   `env=production`, and `SUPABASE_URL` is shown not to be prod (see setup).
2. **Seeds** — finds or creates the demo agent ("מוסך הדגמה"), **deletes that agent's claims
   and stored files**, and inserts three fictional background claims. Nothing outside that
   one agent is touched.
3. **Logs in** off-camera and checks that this run's marker (a phone number generated per
   run) is on the dashboard. If it is not, the app and the seed are pointed at different databases and the run stops.
4. **Records** each segment in its own browser context, then **renders** the mp4.

A run starts by deleting the previous `out/<id>.mp4`. If any step fails, the run exits
non-zero, writes `out/failed-<step>.png`, and there is no mp4.

## What is real and what is not

Every screen in a video is the real app. Two things are stubbed, and only these:

- the vehicle-registry lookup (`/api/vehicle/*`) returns a fixed fictional car, so a made-up
  plate neither hits data.gov.il nor comes back as someone's real vehicle;
- the WhatsApp link is highlighted but never followed.

The filled PDF is the real file from `/api/claims/[id]/form/[insurer]`, rendered with pdf.js
because headless Chromium has no PDF viewer.

All typed values come from `src/demo.ts`; uploads are the generated images in `fixtures/`
(`npm run fixtures` regenerates them). **Never put real personal data in either.**

## Add a video

Copy `videos/00-smoke.ts`, give it a new `id`, and write its segments:

```ts
{ surface: "desktop" | "phone", title?: "chapter card text", steps: [
  { name: "unique-kebab-name", caption: "כתובית", before?: async (c) => {}, run: async (c) => {} },
] }
```

- Per step: `before` → the caption appears → `run` → a hold long enough to read the caption.
  Put the click that *leaves* the previous screen in `before`, so a caption never sits over a
  screen it does not describe.
- `c.stage` has `click`, `type`, `highlight`, `hold`, `titleCard`. Use them instead of raw
  Playwright clicks so the cursor and click ripple show on camera.
- Each segment is a fresh browser context. Desktop segments are logged in as the demo agent;
  phone segments are an anonymous client. Pass values between segments through `c.shared`.
- Select elements by role, label or visible Hebrew text, not CSS classes.
- Phone segments: captions are recorded on a side panel and composited next to the phone.

## Known app quirk

On a 390px phone the wizard's summary page becomes wider than the screen when the accident
description is longer than about 30 characters. That pans the recording sideways, so the scene
checks the page width and `demoClaim.accident.description` is kept short. Once the app is
fixed, the description can be longer.

## Tests

`npm test` — unit tests for the guard, pacing, scene validation and the ffmpeg arguments, plus
browser smoke tests for the caption/cursor overlay. They do not need the app running.
