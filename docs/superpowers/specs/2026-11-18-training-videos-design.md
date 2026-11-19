# Training videos — scripted, auto-recorded walkthroughs

**Date:** 2026-11-18 · **Status:** design, awaiting approval · **Size:** project

## 1. Intent

The people who work in the system day to day (today the garage's פקידה, later every new
customer) need to learn each task by watching it once and then doing it themselves. We want a
series of short Hebrew training videos showing the real screens. Because the UI is still
changing weekly, the videos must be cheap to regenerate: a video is the output of a script,
not a hand-made recording.

The first video is **"מפתיחת תיק ועד טופס הודעה"**: open a claim, send the link to the client,
the client's side on a phone, and producing the filled accident-notice form.

## 2. Goals / non-goals / anti-goals

**Goals**
- One command re-records a video end to end after a UI change.
- Hebrew on-screen captions per step, a visible cursor, and click highlights, so the video is
  understandable with the sound off.
- Output is an `.mp4` (H.264) that plays when sent over WhatsApp.
- Adding the next video means writing one new scene file, not new infrastructure.
- Video 1 delivered, 2–3.5 minutes long.

**Non-goals (this round)**
- Voice narration (user may record a voiceover on top later; captions are the script).
- An in-app help centre, hosting, or embedding the videos anywhere.
- Running in CI. This is a local, on-demand tool.
- Videos 2+ (the list of further topics is decided after video 1 is watched by a real user).

**Anti-goals — would make this a failure even if it "works"**
- Any real person's data in a frame. Never record against prod; never use real ID/licence/plate.
- A video that shows something the real product does not do (mocked UI, faked screens).
  Only external dependencies are stubbed (§5.4); every screen is the real app.
- A recorder so tied to CSS/DOM details that every small UI change breaks it silently.
  It must fail loudly, never record a broken flow.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | User records with Loom/OBS from a script + shot list we write | Human voice, nothing to build; but every UI change means a manual re-record, and takes vary |
| **B** | **Playwright drives the dev app on seeded demo data and records; captions burned in** | **Re-record with one command, consistent, PII-safe; silent, ~1 day setup** |
| C | Illustrated step-by-step page (annotated screenshots) | Cheapest, skimmable; not a video, weak for the phone-side flow |

**Picked: B** (user's decision, 2026-11-18). Reason: a series is planned and the UI is still
moving, so hand recordings go stale within weeks.

## 4. What the first video shows

Chapters, each opened by a full-screen Hebrew title card. Caption wording is the builder's
draft; the user reviews the text in the first rendered cut.

1. **פתיחת תיק** (desktop) — `/dashboard`, the new-claim form (`NewClaimForm.tsx`): type the
   client's name and phone, create.
2. **שליחת הקישור ללקוח** (desktop) — the WhatsApp send affordance and the client link
   (`/c/<token>`). The recorder does **not** follow the `wa.me` link (it leaves the app); it
   highlights the button, and a title card says the client receives the link in WhatsApp.
3. **הצד של הלקוח** (phone viewport) — the wizard at `/c/<token>`, all steps of the path in
   §5.3, including uploads, through submit and the confirmation screen. Tap steps go fast;
   detail steps show typing at a readable speed.
4. **טופס ההודעה** (desktop) — back in `/dashboard`, the claim now shows as submitted; open the
   cockpit `/dashboard/[id]`, the **טופס ההודעה** tab, show the filled fields, edit one field
   to show it is editable, then generate the filled insurer PDF (`FormGenerator.tsx`). The
   button opens `GET /api/claims/[id]/form/[insurer]` in a new tab, and headless Chromium has
   no PDF viewer, so the recorder shows the click, downloads **the real PDF produced in that
   run**, rasterises its pages, and `compose.ts` inserts them as a slow pan segment captioned
   "הטופס המלא, מוכן לשליחה". This is the system's actual output, not a mocked screen. End card.

**Length budget.** The path is 12 visible wizard steps (`driver_details` is skipped). The four
tap steps share one caption and run fast; detail steps get one caption each; typing in long
fields may be speed-ramped in `compose.ts`. Target 3–4 minutes total. If the first cut exceeds
4 minutes, the client chapter becomes its own video rather than rushing the captions.

Demo scenario (fixed, fictional): own-policy claim, insured is the driver, a third party is
present with known details, no injuries. This path exercises the most screens while staying
short. Insurer: one whose template is mapped and visually clean (builder picks; default הראל).

## 5. How it is built

### 5.1 Location and dependencies
A standalone package at repo root: **`training/`** with its own `package.json`
(`playwright`, `ffmpeg-static`, `tsx`, `dotenv`). It is *not* added to `web/package.json`, so
the Vercel build and `web` installs are unaffected. `training/out/` and `training/.env.local`
are git-ignored.

```
training/
  package.json
  README.md               how to run, how to add a video
  .env.example
  src/
    record.ts             CLI: `npm run record -- 01-accident-notice`
    seed.ts               demo agent + cleanup (dev only)
    guard.ts              refuses non-local / prod targets
    stage/                caption overlay, fake cursor, click ripple, title cards, pacing
    compose.ts            ffmpeg: phone-frame padding, concat, mp4 encode
  videos/
    01-accident-notice.ts the scene: ordered steps = { caption, action }
  fixtures/               fictional licence / registration / car photos, marked "דוגמה"
  out/                    rendered mp4s (ignored)
```

### 5.2 Target environment
The recorder runs against an **already-running local app** at `BASE_URL`
(default `http://localhost:3100`; worktree prod builds in this repo usually use `:3101`+), backed by the **dev** Supabase project. Starting the app is
the operator's job (README documents it, incl. the worktree prod-build route).

`guard.ts` aborts before anything else unless: `BASE_URL` host is localhost/127.0.0.1, and
`GET /api/version` reports `env` ≠ `production`. Note `/api/version` reports `local` for anything off Vercel, even if `web/.env.local` points at prod, so there is also a **same-database check**: the seed writes a marker claim for the demo agent and the recorder must see it in the dashboard after login before it records anything. The seed script additionally refuses to run
if the Supabase URL in `training/.env.local` equals a `PROD_SUPABASE_URL` denylist value
(set in `.env.example` instructions).

### 5.3 Demo account and data
- A dedicated **demo agent** in dev Supabase, e.g. `agents.name = "מוסך הדגמה"`. Credentials
  live in `training/.env.local` (`DEMO_AGENT_EMAIL`, `DEMO_AGENT_PASSWORD`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for dev). Never committed, never printed.
- `seed.ts` (service role, dev only): creates the demo auth user if missing (the trigger in `web/db/migrations/001_agent_setup.sql` creates the agent row; the seed only sets `name`), and
  **deletes that demo agent's existing claims** (rows cascade to child tables per `web/db/schema.sql`; storage objects are removed explicitly) so each recording
  starts from the same dashboard. Deletion is scoped by the demo agent's id only.
- Optionally seeds 2–3 older fictional claims so the dashboard isn't empty in frame
  (builder's call on how many and in what statuses).
- All typed values come from one `demoClaim` object in the scene file: fictional names, an
  9-digit ID number that passes the checksum (the wizard only warns, but the cockpit editor `FormFieldEditor.tsx` enforces it) and is obviously synthetic, a 7–8 digit plate, a phone
  number in a non-allocated range.
- Uploads use `training/fixtures/` images: generated placeholder licence (both sides),
  registration, and car photos, each visibly stamped "דוגמה". The user may later swap in real
  staged car photos; nothing depends on their content.

### 5.4 What is stubbed (and only this)
- `GET /api/vehicle/*` is intercepted with Playwright `route()` and returns a fixed fictional
  vehicle, so the plate lookup "works" on camera without hitting data.gov.il with a made-up
  plate or showing a real car.
- The `wa.me` navigation is never followed.
Everything else (auth, claim creation, uploads, submit, form fill, PDF) is the real dev stack.
The post-submit AI analysis call runs for real against dev; the video does not depend on it.

### 5.5 Recording
- Two Playwright browser contexts with `recordVideo`: **desktop** 1280×720 and **phone**
  390×844 (mobile emulation, `he-IL`, RTL as the app renders it). Chromium, headless.
- A scene is an ordered list of steps `{ chapter?, caption, run(page, stage) }`. The `stage`
  helpers (injected into the page, never part of the app code):
  - caption bar: RTL Hebrew, bottom of frame, hold time derived from text length;
  - fake cursor that glides to the target before a click, plus a click ripple
    (headless video has no OS cursor);
  - element highlight ring; typed input at human-readable speed;
  - title cards between chapters.
- Selectors are **role/label/visible-Hebrew-text based** (`getByRole`, `getByLabel`,
  `getByText`), not CSS classes. If a product element is genuinely unaddressable, adding a
  `data-testid` to `web/` is allowed, as a separate small PR.
- Any step timeout or missing element fails the run with the step name and a screenshot; no
  mp4 is produced from a failed run.
- The client token is read from the link shown in the dashboard after creation (not from the
  DB), so chapter 2→3 is the same hand-off a real user performs.
- Uploads go through the real file inputs via `setInputFiles`.

### 5.6 Composition
`compose.ts` uses `ffmpeg-static` (no system ffmpeg on this machine): phone segments are
centred on a 1280×720 brand-coloured background (with a simple phone-frame outline), segments
are concatenated in scene order, encoded H.264 + yuv420p + faststart, 30 fps, silent audio
track included (some players/WhatsApp handle that more reliably). Output:
`training/out/01-accident-notice.mp4`. Target file size under 16 MB.

### 5.7 Verification
The builder verifies by running the recorder for real and reviewing extracted frames (one per
caption) for: correct screen, caption legible and not covering the control being shown,
Hebrew rendering correctly, no real data. Then hands the mp4 to the user. "Done" = the user
has the mp4 and the re-record command works a second time from a clean state.

## 6. Decisions made by the author (not yet confirmed by the user)
- Standalone `training/` package rather than inside `web/`.
- One ~3-minute video with four chapters, rather than four separate clips.
- The demo scenario in §4 (own policy + third party present, no injuries).
- Placeholder "דוגמה" fixture images rather than staged real photos.
- Stubbing the vehicle-registry lookup.
- Brand-background + phone-frame treatment for the phone chapter, cut (not side-by-side).
- The filled PDF is shown as rasterised pages of the real output, not a live browser PDF viewer.
- Length: 3–4 minutes; split the client chapter out if longer.
- mp4 delivered as a file; where it is hosted/sent is out of scope.

## 7. Left to the builder
Caption wording draft, pacing constants, exact stage styling (colours from the app CSS; `web/public/brand/` holds logos only), number of filler claims, fixture image generation method, ffmpeg filter
details, README content.

## 8. Operator prerequisites (user)
- Dev Supabase service-role key and URL available in `web/.env.local` (already the case) to
  copy into `training/.env.local`.
- No DB migration is introduced by this work.
