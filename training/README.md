# Training videos

Scripted, re-recordable walkthrough videos for the people who use the system. A video is the
output of a script: Playwright drives the **real app** on fictional demo data, records it, and
ffmpeg renders an `.mp4` with Hebrew captions. When the UI changes, re-run the command.

Design and rationale: [`docs/superpowers/specs/2026-11-18-training-videos-design.md`](../docs/superpowers/specs/2026-11-18-training-videos-design.md).

| Video | Scene file | Shows |
|---|---|---|
| `01-accident-notice` | `videos/01-accident-notice.ts` | open a claim → send the link → the client's side (phone) → the filled accident notice |
| `02-third-party` | `videos/02-third-party.ts` | a third-party claim: the client reports the other driver at fault → the office picks the track ("דוח פרטי") → papers and the amounts read from the appraiser's report → demand letter → sending to the other side's insurer → status and payment |
| `00-smoke` | `videos/00-smoke.ts` | 7-second check that login, recording and rendering work |
| promo (ten files) | `promo/` | a short video for prospective customers — see [Promo video](#promo-video) |

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

## Sending from the app (video 02)

Video 02 shows the office sending the claim to the insurer from inside the app. No mail may
leave the machine for that, so the app is pointed at a local stand-in for the mail provider:

```bash
npm run mail-sink     # in training/: listens on 127.0.0.1:47187, keeps only a count
```

and the app is started with four variables set **in the shell, not in `web/.env.local`**:
`EMAIL_PROVIDER_API_KEY=local-mail-sink`, `EMAIL_WEBHOOK_SECRET=local-mail-sink`,
`EMAIL_INBOUND_DOMAIN=tikim.example.com` and `RESEND_BASE_URL=http://127.0.0.1:47187`.

The scene refuses to start its send chapter when the sink is not running, types a demo
recipient over the insurer's real address, and fails if the message did not arrive at the
sink. Off camera it gives the demo business a system address (`inbound_alias`) and a copy
mailbox, in the dev database, on the demo agent only.

## What is real and what is not

Every screen in a video is the real app. Two things are stubbed, and only these:

- the vehicle-registry lookup (`/api/vehicle/*`) returns a fixed fictional car, so a made-up
  plate neither hits data.gov.il nor comes back as someone's real vehicle;
- the WhatsApp link is highlighted but never followed.

In video 02 one more: the mail the app sends goes to a local sink instead of the mail
provider (see above), to a demo recipient.

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

## Promo video

A short video for prospective customers, in `promo/`: the WhatsApp chase, three real product
moments, an outcome line, and a WhatsApp call to action. Two audience versions (`garage`,
`agent`), three shapes each (9:16, 1:1, 16:9), plus a 15-second cut for ads: ten files in
`out/promo/`. Design: [`docs/superpowers/specs/2026-11-18-promo-video-design.md`](../docs/superpowers/specs/2026-11-18-promo-video-design.md).

It is made in two stages, so wording and design can change without touching the app:

```bash
npm run promo:footage   # needs the app running, like `record`. Records the real app live.
npm run promo:edit      # needs only those recordings. Writes the ten files.
```

`promo:footage` follows every safety rule of `record` (same guard, same demo account, same
stubbed vehicle lookup) and seeds the demo business as "מוסך הדגמה" or "סוכנות הדגמה"; pass
`garage` or `agent` to record one audience. `promo:edit` takes `--audience`, `--ratio` and
`--cut`, for example `npm run promo:edit -- --audience garage --ratio 9x16`.

| To change | Edit |
|---|---|
| any wording, the phone number | `promo/copy.ts`, then `promo:edit` |
| the drawn opening and closing | `promo/compositions/` (`opening`, `closing`), lengths in `promo/beats.ts` |
| what the app is filmed doing, and the marks the edit cuts on | `promo/footage.ts`, then `promo:footage` |
| which takes are used, their speed, where screens sit per shape | the `Take` lists and `planFor` in `promo/edit.ts` |

**What is real.** The product part is a live recording of the real app on demo data, driven
like the training video (cursor, taps, uploads), and the form is the real filled PDF. The
phone is recorded once; the office is recorded once per output shape (1280px wide for 16:9,
720px for square and vertical), so each shape shows the app's own layout for that width at a
readable size. One thing is hidden on the real screens: the demo account's login address.
The chat thread in the opening is a drawing of life *without* the product and is
deliberately not our interface. Insurer names are listed only while that insurer's template
exists in `web/src/lib/formfill/templates/`.

**Working the claim** (full cuts only). Two beats follow the form, filmed on the real screens:

- *Completing and sending.* On the phone the client defers the vehicle registration ("אשלח
  בהמשך"), so the office sees what is missing and sends the reminder. Off camera the document
  is then added through the app's own route, and the office is filmed opening the send
  screen and marking the claim as sent. Where the task list can be shown without the word
  the garage cut avoids, it is filmed too; otherwise that take is skipped and the edit
  leaves it out.
- *Following.* Six days later (the date is moved in the dev database, off camera) the office
  changes the status with the insurer in the real dialog.

Each output shape films the same steps, so before each one the demo claim is put back to
its unsent state straight in the dev database (scoped to the demo agent's claim). The demo
account does not send mail from the app, so the send is the "I sent it from my mailbox"
confirmation. Inbound mail is not shown: it is filed on a claim but does not change the
status by itself, and the video must not suggest otherwise.

**Narration.** The script is `promo/narration.md`, one line per beat. No voice is mixed yet.

**What must stay true.** No number, testimonial or customer name that is not real; the copy
is qualitative until there is a pilot figure approved for marketing. No "סוכן" in the
garage version: the recorder fails if the word is on screen at any of its checkpoints, and
the scroll over the insurer's form starts below the printed line that says it. If a form
template or the app's layout changes, look at the frames again.

**Uploads.** The documents are props made to look like phone photos (`promo/fixture-docs.ts`,
`npm run promo:fixtures`): fictional details from `src/demo.ts`, no state emblem, a
silhouette for a face. Car pictures are drawn unless three or more real photos are in
`fixtures/promo/user/` (git-ignored). Use only photos with no legible plate (blur it), no
person and no customer's identifiable car, strip their metadata, and look at every frame
that shows them before publishing.

**The earlier cut.** `promo:capture` + `promo:render` build the same ten file names from
stills with a travelling camera (`compositions/product.ts`). It is kept for its layout tests
and as a fallback; the live cut is the one to publish.

**Music.** None is shipped. Set `PROMO_MUSIC` in `.env.local` to a track you hold a licence
for; it is mixed under the video and faded out. The video length never changes.

**Layout rules, enforced by tests.** Words stay inside each shape's safe area (the vertical
video gives up the top 14% and bottom 20% to the apps' own buttons), never overlap a
picture, and still fit when 25% longer. A wording change that breaks this fails `npm test`.

**Adding a beat** (the claim-handling one is the model): record it in `footage.ts` with marks at its
start and end, and add a `screen(...)` call with its takes and its line of copy in `edit.ts`.

## Known app quirk

On a 390px phone the wizard's summary page becomes wider than the screen when the accident
description is longer than about 30 characters. That pans the recording sideways, so the scene
checks the page width and `demoClaim.accident.description` is kept short. Once the app is
fixed, the description can be longer.

## Tests

`npm test` — unit tests for the guard, pacing, scene validation and the ffmpeg arguments, plus
browser smoke tests for the caption/cursor overlay. They do not need the app running.
The promo adds layout tests for every beat in every shape and one real 15-second render,
so the full run takes about two and a half minutes.
