# Promo video — pain → product → outcome, in two audience versions

**Date:** 2026-11-18 · **Status:** design, awaiting approval · **Size:** project

Sibling of [`2026-11-18-training-videos-design.md`](2026-11-18-training-videos-design.md)
(training videos, PR #126/#127). This one is a different product on the same foundation.

## 1. Intent

A short, good-looking video that makes the **owner** of a garage or an insurance agency want
a demo. It is sent one-to-one over WhatsApp to prospects, used in paid campaigns, and posted on
social networks. So it is watched on a phone, usually muted, by someone who did not ask to see
it: the first three seconds decide whether the rest is watched.

A training video shows *how* to do each step. This one shows *why you want it* and only as much
product as it takes to be believed.

## 2. Goals / non-goals / anti-goals

**Goals**
- Two audience versions: **garage** and **insurance agent**. Same product footage in the
  middle, different hook and different outcome line.
- Each version in three aspect ratios: **9:16** (stories/reels/WhatsApp), **1:1** (feed),
  **16:9** (meeting, website).
- Full cut 35–40 s, plus a **15 s cut** per version (9:16 and 1:1) for paid ads.
- Fully understandable with the sound off.
- Call to action: **WhatsApp**, the same number and wording the landing page uses
  (`web/src/app/page.tsx`: "לתיאום הדגמה בוואטסאפ", `052-448-8867`).
- Rendered from code, like the training videos: after a UI change or a copy change, one command
  re-renders every file.

**Non-goals (this round)**
- Voice-over, and filmed footage of people (a customer testimonial comes later, once there is
  a paying customer willing to be filmed; it complements this video).
- Claim *management* (tasks, tracks, deadlines, third-party handling). The user wants it shown
  later, when that feature is finished. The scene list is built so a beat can be added (§5.3).
- Publishing. The deliverable is files; the user posts and sends them.
- Changing the landing page.

**Anti-goals — a failure even if it renders**
- A number, testimonial, customer name or logo that is not real. There is no pilot metric
  approved for marketing today, so the copy is qualitative. If the user supplies a real number,
  it goes in; nothing is invented to fill the gap.
- A screen the product does not have. Product moments are captures of the real app on demo
  data. The only illustrated part is the "before" chat, which depicts life *without* the
  product and must not look like a screenshot of our system.
- Any real person's data in a frame (same rule and same demo data as the training videos).
- Insurer logos or a pixel-copy of the WhatsApp interface. Insurer names as plain text are
  fine (the landing page already lists them); the chat is a generic bubble thread in the style
  of the landing page's `BeforeAfter` component.
- Looking like a screen recording with titles on top. If it does not look designed, it has
  failed the "beautiful" requirement.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Fast product demo: real footage, sped up, with headlines | Cheapest; shows *what*, not *why* |
| **B** | **Pain → product → outcome: designed opening and closing, real product in the middle** | **More work; far more persuasive; still re-renderable** |
| C | Filmed testimonial of the garage owner | Strongest for trust; needs filming and a willing customer |

**Picked: B, both audience versions, WhatsApp CTA** (user's decision, 2026-11-18).

## 4. The video

### 4.1 Beats (full cut)

| # | Time | What is on screen |
|---|---|---|
| 1 | 0–4 s | **The chase.** A chat thread fills up: "עברתי תאונה", "תשלח צילום רישיון + רישיון רכב + תמונות נזק", a blurred photo, "זה הצד הלא נכון…", "אשלח מחר מבטיח". The hook line lands over it. |
| 2 | 4–7 s | **Turn.** The thread collapses into the logo and the line "קישור אחד. תיק מסודר." |
| 3 | 7–14 s | **The client does it alone.** Phone: the wizard, three or four screens (a tap question, the licence photo, the car photos, "נשלח"). Label: "הלקוח ממלא ומצלם, מהטלפון". |
| 4 | 14–20 s | **The case arrives complete.** The dashboard row turning to submitted, then the cockpit with documents and details. Label: "הכול מגיע מסודר לתיק אחד". |
| 5 | 20–27 s | **The form fills itself.** The generate click, then the real filled accident-notice PDF. Label: "טופס ההודעה לחברת הביטוח, ממולא". Small line: the insurer names as text. |
| 6 | 27–33 s | **Outcome line** for this audience (§4.2), on a clean brand background. |
| 7 | 33–38 s | **End card.** Logo, tagline "פותחים תיק. סוגרים עניין.", WhatsApp glyph, "לתיאום הדגמה בוואטסאפ", `052-448-8867`. Holds for at least 4 s. |

The 15 s cut is beats 1 (2.5 s) → 3+4+5 as one fast montage (8 s) → 7 (4.5 s). In the 15 s
cut the end card carries the audience's outcome line above the CTA, so the garage and agent
files differ in message and not only in the business name inside the footage.

**Insurer names (beat 5).** The nine names the landing page lists (הראל · מגדל · הפניקס ·
מנורה · איילון · הכשרה · שלמה · ליברה · AIG). Each has a form template on `main`
(`web/src/lib/formfill/templates/`, checked 2026-11-18). A name is shown only if its template
exists at render time.

**The word "סוכן" in the garage version.** The app itself says "סוכן" in places a garage sees
(for example "הערות סוכן" in the cockpit). `web/` is not changed by this work, so the garage
version's captures are framed or cropped so that no "סוכן" label is legible. The builder
checks this in the frame review.

**Photos in the footage.** The training fixtures are stamped "דוגמה", which is right for
training and wrong for a promo. The promo gets its own fixture set, with no stamp:
- car and damage photos: **supplied by the user** from the garage (no legible plate, no
  person, no customer's identifiable car), or, if none are supplied, clean illustrated
  placeholders drawn for the promo;
- licence and registration: always illustrated documents with fictional details, never a
  photo of a real document, shown small or partly covered so they read as "a document" and
  not as data.

### 4.2 Copy per version (draft; the user reviews wording in the first cut)

| | Garage | Insurance agent |
|---|---|---|
| Hook (beat 1) | "לקוח אחרי תאונה. ועכשיו רודפים אחרי המסמכים." | "לקוח אחרי תאונה. ועכשיו רודפים אחרי המסמכים." |
| Outcome (beat 6) | "פחות מרדף. הרכב נכנס לעבודה עם תיק מלא." | "הלקוח מקבל שירות. אתה מקבל תיק מוכן להגשה." |
| Demo business name in footage | "מוסך הדגמה" | "סוכנות הדגמה" |

The garage line speaks to the owner about work coming in and not getting stuck, because the
buyer is the owner and not the clerk who saves the hours (project `CLAUDE.md`, "Traps"). No
line promises a speed or money figure.

All Hebrew copy lives in one file, so a wording change is an edit and a re-render.

### 4.3 Look

- Brand tokens from `web/src/app/globals.css`: ink `#182438`, brand blue `#1d4ed8`, canvas
  `#f6f8fc`; WhatsApp-green button `#1faa55` as on the landing page.
- Headlines in **Frank Ruhl Libre** (the landing page's display face), everything else in
  **Heebo**. Both are open-licensed; they are bundled with the tool, not fetched at render time.
- Product captures sit inside a simple device frame (phone or browser window) on the brand
  background, with slow push-ins, a visible tap indicator, and cross-fades between states.
- Logo files from `web/public/brand/`.
- Text stays inside the platform safe area: in 9:16 nothing important in the top 14 % or the
  bottom 20 % (covered by app chrome on stories/reels).

### 4.4 Sound

No music is shipped: no track can be supplied with a licence from here. Every file carries a
silent audio track (as the training videos do). If the user provides a licensed track, a
`PROMO_MUSIC` path mixes it under the video with a fade-out; nothing else changes.

## 5. How it is built

### 5.1 Where
Inside the existing `training/` package (it already has the seed, the prod guard, the demo
data and the encoder), in a new `training/promo/` folder. `training/` is not on `main` until
PR #127 merges, so **the code branch for this work is cut from `main` after #127 is merged**
(the repo rule is no stacked PR bases). This design doc does not depend on it.

### 5.2 Two stages

**Stage 1 — capture.** A recorder scene (same machinery and same safety rules as the training
videos: localhost only, dev database, demo agent, stubbed vehicle lookup) walks the flow once
per version and saves **high-resolution still captures** of the real app at named moments
(device scale factor 2), plus the real filled PDF rasterised to images. Stills instead of live
video because Playwright's live recording is soft and drops frames, and a promo is judged on
sharpness. Captures are named and listed in a manifest; a missing capture fails the run.

The seed gains a parameter for the demo business name so the agent version does not say
"מוסך". It still touches only the stamped demo account.

**Stage 2 — render.** Each beat is an HTML/CSS composition that places copy, captures and
motion for a given aspect ratio. A renderer opens the composition in headless Chromium at the
output size, **steps a virtual clock frame by frame** (animations are driven by setting their
current time, never by wall-clock playback), screenshots each frame at 30 fps, and pipes the
frames to ffmpeg (H.264, yuv420p, faststart). Frame-stepping makes the output deterministic
and smooth regardless of machine load.

Output sizes: 1080×1920, 1080×1080, 1920×1080. Ten files per render:
`out/promo/<garage|agent>-<9x16|1x1|16x9>.mp4` and `…-15s-<9x16|1x1>.mp4`.
Each under 16 MB so it sends over WhatsApp without recompression by the sender.

### 5.3 Structure

```
training/promo/
  copy.ts          all Hebrew copy, per version; CTA text and number
  beats.ts         ordered beat list per cut: { id, durationMs, composition }
  capture.ts       stage 1 scene: named still captures + PDF pages → out/promo/captures/
  compositions/    one HTML/CSS composition per beat, laid out per aspect ratio
  render.ts        stage 2: frame-stepped render + ffmpeg encode
  fonts/           bundled Heebo + Frank Ruhl Libre
```

Commands: `npm run promo:capture` (needs the app running, like `record`) and
`npm run promo:render` (needs only the captures; no app, no database). Splitting them means a
copy or design change re-renders in minutes without touching the app.

Adding the claim-management beat later = one new capture set, one new composition, one new
entry in `beats.ts`.

### 5.4 Build order
1. **Spike first:** render a 5-second test (one headline, one moving capture) in all three
   ratios and look at it. This proves frame-stepping is smooth, Hebrew renders correctly in
   both fonts, and the encode plays on a phone. If the spike fails on smoothness or cost, the
   fallback is Remotion (a React video framework; free for a company of this size) and the
   rest of this design is unchanged.
2. Capture stage. 3. Compositions, 9:16 first (the primary channel). 4. Other ratios.
5. 15 s cut. 6. Second audience version.

### 5.5 Verification
- Unit tests: beat timing adds up per cut; every capture a composition references is in the
  manifest; every copy key exists for both versions; frame-stepping gives identical frames on
  two runs of the same beat.
- The builder reviews extracted frames from every output (one per beat per ratio) for: text
  inside the safe area and not clipped, Hebrew correct, captures sharp, demo data only, and
  the end card legible at phone size.
- "Done" = the user has the ten files, has approved the copy, and a second `promo:render`
  reproduces them.

## 6. Decisions made by the author (not yet confirmed by the user)
- Length 35–40 s, and a 15 s cut in 9:16 and 1:1 only.
- The seven beats in §4.1, and which three product moments are shown.
- The draft copy in §4.2, including the same hook for both versions.
- Qualitative claims only until a real pilot number is supplied.
- No music shipped; optional user-supplied track.
- CTA number and wording copied from the landing page.
- Sharp stills with motion instead of live screen video.
- Own frame-stepped renderer, with Remotion as the fallback.
- Lives in `training/promo/`; code waits for PR #127 to merge.
- Claim management left out of this cut.
- The 15 s cut carries the outcome line on the end card.
- The garage version hides the app's "סוכן" labels by framing, not by changing the app.
- A separate, unstamped fixture set for the promo; illustrated documents always.

## 7. Left to the builder
Exact motion and easing, device-frame drawing, per-ratio layouts, capture moments within each
product beat, encoder settings, test layout, README section.

## 8. Operator prerequisites (user)
- Merge PR #127 before the build starts.
- Same local setup as the training videos (`training/.env.local`, app running on dev data).
- No DB migration. Nothing is added to `web/`.
