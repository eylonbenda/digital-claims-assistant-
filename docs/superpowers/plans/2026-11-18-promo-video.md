# Promo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render ten promo mp4s (2 audiences × 3 aspect ratios full cut, plus a 15 s cut in 2 ratios) from code, using real captures of the app.

**Architecture:** Two stages inside the existing `training/` package. *Capture* drives the real app with the existing recorder machinery and saves sharp stills plus a manifest. *Render* opens HTML/CSS compositions in headless Chromium, steps a virtual clock frame by frame, and pipes screenshots to ffmpeg. Render needs no app and no database.

**Tech Stack:** TypeScript, tsx, Playwright (Chromium), ffmpeg-static, pdfjs-dist, `@fontsource/heebo`, `@fontsource/frank-ruhl-libre`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-18-promo-video-design.md`

## Global Constraints

- All code under `training/promo/` (plus the small changes to `training/src/` named below). Nothing is added to `web/`. No DB migration.
- `training/` reaches `main` through PR #127. Cut the code branch so that its PR targets `main` (`gh pr create --base main`); never use another branch as PR base.
- Capture obeys every training-video safety rule: `assertSafeTarget(env)` first, localhost only, dev database, the stamped demo account only, `**/api/vehicle/**` stubbed. Never prod.
- No real person's data in any frame. No invented number, testimonial, customer name, or logo. No insurer logos. The "before" chat is a generic bubble thread, not a copy of the WhatsApp UI.
- Insurer names shown: `הראל · מגדל · הפניקס · מנורה · איילון · הכשרה · שלמה · ליברה · AIG`, each only if its template file exists in `web/src/lib/formfill/templates/`.
- CTA: text `לתיאום הדגמה בוואטסאפ`, number `052-448-8867`, tagline `פותחים תיק. סוגרים עניין.`
- Colours: ink `#182438`, brand `#1d4ed8`, canvas `#f6f8fc`, CTA green `#1faa55`. Headlines Frank Ruhl Libre 700/900; everything else Heebo. Fonts load from the npm packages, never the network.
- Output: 30 fps, H.264, yuv420p, faststart, an audio track always present (silent unless `PROMO_MUSIC` is set). Sizes `9x16` = 1080×1920, `1x1` = 1080×1080, `16x9` = 1920×1080. Each file under 16 MB.
- Full cut 35–40 s. Short cut 15 s (±0.5 s). End card on screen at least 4 s.
- Safe area: in `9x16`, no copy in the top 14 % or bottom 20 % of the frame; in all ratios, 5 % margin on every side.
- Garage version: no legible "סוכן" in any frame.
- Draw Hebrew in logical order; never reverse strings. Hebrew text containers are `dir="rtl"`; the phone number is `dir="ltr"`.
- A failed capture or render exits non-zero and leaves no mp4 for that output.
- Tests run with `npm test` in `training/` and must not need the app running. `npm run typecheck` stays clean.

## Review Focus

1. **A font fails to load and Chromium silently falls back.** Expect: render aborts naming the font. (Task 1)
2. **Copy is edited to something longer and overflows or leaves the safe area.** Expect: the layout test fails, not a clipped frame in a shipped file. (Task 5)
3. **Captures on disk belong to the other audience or an older run.** Expect: render refuses a manifest whose `audience` differs or that lacks a required id. (Tasks 4, 6)
4. **`PROMO_MUSIC` is shorter or longer than the video, or the path does not exist.** Expect: missing file is an error; any length yields a file exactly as long as the video, music faded out at the end. (Task 6)
5. **A user-supplied car photo shows a plate or a person.** No test can catch this. Expect: the builder inspects every user photo and every frame that shows one before delivery, and says so in the hand-off. (Task 7)

---

### Task 1: Frame-stepped renderer (this is the spike)

**Files:**
- Create: `training/promo/timeline.ts`, `training/promo/renderer.ts`, `training/promo/fonts.ts`, `training/promo/compositions/spike.ts`
- Modify: `training/package.json` (add the two `@fontsource` packages; script `"promo:spike": "tsx promo/renderer.ts spike"`; extend the `test` glob to include `promo/__tests__/*.test.ts`), `training/tsconfig.json` (include `promo`)
- Test: `training/promo/__tests__/timeline.test.ts`, `training/promo/__tests__/renderer.test.ts`

**Interfaces:**
- Produces:
  - `type Ratio = "9x16" | "1x1" | "16x9"`; `SIZE: Record<Ratio, { width: number; height: number }>`
  - `frameCount(durationMs: number, fps?: number): number` (fps default 30, `Math.round`)
  - `frameTimeMs(index: number, fps?: number): number`
  - `fontFaceCss(): string` — `@font-face` rules with the font files inlined as base64 from the `@fontsource` packages (Hebrew subset; Heebo 400/500/700, Frank Ruhl Libre 700/900)
  - `type Composition = { html: string; durationMs: number }` — `html` is a full document; all motion is CSS animations or Web Animations, none driven by timers
  - `renderFrames(page: Page, comp: Composition, ratio: Ratio, onFrame: (png: Buffer, index: number) => Promise<void>): Promise<number>` — sets viewport to `SIZE[ratio]`, `setContent`, waits for `document.fonts.ready`, throws `font not loaded: <family>` if `document.fonts.check` fails for either family, pauses every animation, then per frame sets `currentTime = frameTimeMs(i)` on `document.getAnimations({ subtree: true })` and screenshots. Returns frames written.
  - `encodeFrames(outPath: string, ratio: Ratio, feed: (write: (png: Buffer) => Promise<void>) => Promise<void>, opts?: { music?: string; durationMs: number }): Promise<void>` — ffmpeg `image2pipe` on stdin
  - `buildEncodeArgs(outPath: string, ratio: Ratio, opts: { music?: string; durationMs: number }): string[]`

- [ ] **Step 1: Write failing tests**

`timeline.test.ts`: `frameCount(5000) === 150`; `frameCount(15000) === 450`; `frameTimeMs(0) === 0`; `frameTimeMs(30) === 1000`.

`renderer.test.ts` (launches Chromium, no app):
- *deterministic*: render frame 45 of the spike composition twice in `9x16`; the two PNG buffers are byte-equal.
- *moves*: frame 0 and frame 60 differ.
- *font guard*: a composition whose CSS names `font-family: "Frank Ruhl Libre"` but omits `fontFaceCss()` makes `renderFrames` reject with a message matching `font not loaded`.
- *args*: `buildEncodeArgs("o.mp4","1x1",{durationMs:5000})` contains `-pix_fmt`,`yuv420p`, `-movflags`,`+faststart`, `-r`,`30`, and an `anullsrc` input; with `music:"m.mp3"` it contains `m.mp3`, an `afade=t=out` filter, and `-t`,`5.000`, and no `anullsrc`.

- [ ] **Step 2: Run** `npm test` — Expected: the new tests FAIL (modules missing).
- [ ] **Step 3: Implement** the interfaces above. `spike.ts` exports `spike(ratio: Ratio): Composition`: 5000 ms, canvas background, one Frank Ruhl Libre headline `פותחים תיק. סוגרים עניין.` sliding in, one Heebo line, one rounded card moving across the frame.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` — Expected: PASS, clean.
- [ ] **Step 5: Spike gate.** Run `npm run promo:spike` → `out/promo/spike-<ratio>.mp4` for all three ratios. Extract frames at 0.5 s, 2.5 s, 4.5 s from each and look at them: Hebrew in the right order and the right fonts, motion positions advance evenly, no torn frames. Record wall time per 5 s clip.
  Expected: correct frames; under 90 s per clip. **If motion is uneven or a clip takes over 5 minutes, stop and report to the user** (the spec's fallback is Remotion; that is their call).
- [ ] **Step 6: Commit** `feat(promo): frame-stepped renderer and spike`

### Task 2: Copy and beat lists

**Files:**
- Create: `training/promo/copy.ts`, `training/promo/beats.ts`
- Test: `training/promo/__tests__/copy.test.ts`, `training/promo/__tests__/beats.test.ts`

**Interfaces:**
- Produces:
  - `type Audience = "garage" | "agent"`
  - `COPY: Record<Audience, { hook: string; outcome: string; businessName: string }>` with the spec §4.2 strings verbatim
  - `SHARED = { turn: "קישור אחד. תיק מסודר.", client: "הלקוח ממלא ומצלם, מהטלפון", caseFile: "הכול מגיע מסודר לתיק אחד", form: "טופס ההודעה לחברת הביטוח, ממולא", tagline, ctaText, ctaPhone, chat: string[] }` (`chat` = the five bubbles of spec beat 1)
  - `INSURERS: { name: string; template: string }[]` (nine entries, e.g. `{ name: "הראל", template: "harel" }`); `insurersWithTemplate(templatesDir: string): string[]`
  - `type Cut = "full" | "short"`; `type BeatId = "chase" | "turn" | "client" | "caseFile" | "form" | "montage" | "outcome" | "endCard"`
  - `beatsFor(cut: Cut): { id: BeatId; durationMs: number }[]`; `totalMs(cut: Cut): number`
  - `OUTPUTS: { audience: Audience; cut: Cut; ratio: Ratio; file: string }[]` — the ten files, names per spec §5.2

- [ ] **Step 1: Write failing tests** — both audiences have non-empty `hook`, `outcome`, `businessName`; garage `businessName === "מוסך הדגמה"`, agent `=== "סוכנות הדגמה"`; no garage string contains `סוכן`; `totalMs("full")` between 35000 and 40000; `totalMs("short")` between 14500 and 15500; `endCard` ≥ 4000 in both cuts; full cut order is `chase,turn,client,caseFile,form,outcome,endCard`; short cut order is `chase,montage,endCard`; `OUTPUTS.length === 10` with exactly the names `garage-9x16.mp4 … agent-15s-1x1.mp4`; `insurersWithTemplate` on a temp dir holding only `harel.ts` and `aig.ts` returns `["הראל","AIG"]`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(promo): copy and beat lists`

### Task 3: Seed business name and promo fixtures

**Files:**
- Modify: `training/src/seed.ts`, `training/src/__tests__/seed.test.ts`, `training/.gitignore` (add `fixtures/promo/user/`)
- Create: `training/promo/make-fixtures.ts`, `training/promo/fixtures.ts`, `training/fixtures/promo/*.png`
- Test: `training/promo/__tests__/fixtures.test.ts`

**Interfaces:**
- Consumes: `seed(env)` from `training/src/seed.ts`.
- Produces:
  - `seed(env: Env, opts?: { businessName?: string }): Promise<{ agentId: string; markerPhone: string }>` — default stays `"מוסך הדגמה"`; pure helper `agentName(opts?): string` exported for the test
  - `promoFixtures(dir?: string): { licenceFront: string; licenceBack: string; registration: string; cars: string[] }` — for `cars`, returns the image files in `fixtures/promo/user/` when that folder has at least three, otherwise the three generated `fixtures/promo/car-*.png`
  - `npm run promo:fixtures` regenerates the illustrated set: no "דוגמה" stamp, fictional details only, drawn (a simple car illustration with a dented panel; document cards with blurred-looking text lines)

- [ ] **Step 1: Write failing tests** — `agentName() === "מוסך הדגמה"`, `agentName({ businessName: "סוכנות הדגמה" }) === "סוכנות הדגמה"`; `promoFixtures(tmp)` with an empty `user/` returns the three generated car paths; with three files in `user/` returns those three; with two returns the generated ones.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, generate the fixtures, look at each PNG.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS (all earlier training tests too).
- [ ] **Step 5: Commit** `feat(promo): demo business name and promo fixtures`

### Task 4: Capture stage

**Files:**
- Modify: `training/src/record.ts` (export `loginAndCheckDatabase`; let `newSegmentContext` take `opts?: { deviceScaleFactor?: number; recordVideo?: boolean }` and export it), `training/package.json` (script `"promo:capture": "tsx promo/capture.ts"`)
- Create: `training/promo/manifest.ts`, `training/promo/capture.ts`
- Test: `training/promo/__tests__/manifest.test.ts`

**Interfaces:**
- Consumes: `seed(env, { businessName })`, `promoFixtures()`, `COPY`, the exported recorder helpers, `demoClaim`.
- Produces:
  - `CAPTURE_IDS` (const tuple): `client-question`, `client-licence`, `client-photos`, `client-sent`, `dashboard-submitted`, `cockpit-overview`, `cockpit-files`, `form-tab`, `pdf-page-1`
  - `type Manifest = { audience: Audience; capturedAt: string; captures: { id: CaptureId; file: string; width: number; height: number; surface: "phone" | "desktop" | "pdf" }[] }`
  - `checkManifest(m: Manifest, audience: Audience): string[]` — problems: wrong audience, missing id, duplicate id; empty array means usable
  - `readManifest(audience: Audience): Manifest` — from `out/promo/captures/<audience>/manifest.json`; throws listing `checkManifest` problems
  - `capturePromo(env: Env, audience: Audience): Promise<Manifest>` — guard, seed with the audience's business name, login, walk the flow of `videos/01-accident-notice.ts` without stage captions (plain Playwright actions), `page.screenshot` at each id with `deviceScaleFactor: 2`, fetch the real PDF and rasterise page 1 with pdfjs at scale 2; deletes the audience's previous capture folder first; writes the manifest last
  - CLI: `npm run promo:capture -- [garage|agent]` (both when omitted)

- [ ] **Step 1: Write failing tests** for `checkManifest`: complete garage manifest → `[]`; asked as `agent` → one problem naming the audience; one id removed → problem naming that id; duplicated id → problem.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Real run.** Start the app as `training/README.md` describes, run `npm run promo:capture`. Expected: two manifests, nine PNGs each, phone captures 780 px wide, desktop 2560 px wide. Open every PNG: right screen, demo data only, business name matches the audience.
- [ ] **Step 6: Commit** `feat(promo): capture stage`

### Task 5: Compositions

**Files:**
- Create: `training/promo/compositions/layout.ts`, `device.ts`, and one file per `BeatId` (`chase.ts`, `turn.ts`, `client.ts`, `case-file.ts`, `form.ts`, `montage.ts`, `outcome.ts`, `end-card.ts`), `index.ts`
- Test: `training/promo/__tests__/compositions.test.ts`

**Interfaces:**
- Consumes: `Composition`, `Ratio`, `SIZE`, `fontFaceCss`, `COPY`, `SHARED`, `insurersWithTemplate`, `Manifest`.
- Produces:
  - `safeRect(ratio: Ratio): { x: number; y: number; width: number; height: number }` per the Global Constraints
  - `type BeatProps = { audience: Audience; cut: Cut; ratio: Ratio; durationMs: number; captures: Record<CaptureId, string>; insurers: string[] }` (`captures` values are `data:` URLs)
  - `compose(id: BeatId, props: BeatProps): Composition`
  - Convention: every copy element carries `data-copy`; captures are cropped by their frame element. In `case-file.ts` and `montage.ts` the crop for `audience: "garage"` excludes the cockpit regions that carry a "סוכן" label.
  - `outcome.ts` renders `COPY[audience].outcome`; `end-card.ts` renders logo, tagline, CTA, phone, and, when `cut === "short"`, the outcome line above the CTA.

- [ ] **Step 1: Write failing tests** (Chromium, synthetic solid-colour captures, no app). For every `BeatId` valid in each cut × both audiences × three ratios, render the frame at 60 % of the beat and assert in-page: every `[data-copy]` box lies inside `safeRect(ratio)`; no `[data-copy]` has `scrollWidth > clientWidth`; no two `[data-copy]` boxes intersect; each has computed `direction: rtl` except `[data-ltr]`. Extra: the same assertions hold when every copy string is replaced by one 25 % longer; garage `outcome`/`end-card` HTML contains no `סוכן`; `end-card` in the short cut contains the outcome string, in the full cut it does not.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, `9x16` first, then `1x1`, then `16x9`. Motion per spec §4.1 and §4.3.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(promo): beat compositions`

### Task 6: Assemble and render all outputs

**Files:**
- Create: `training/promo/render.ts`
- Modify: `training/package.json` (script `"promo:render": "tsx promo/render.ts"`), `training/.env.example` (`PROMO_MUSIC=`), `training/src/env.ts` (optional `promoMusic?: string`)
- Test: `training/promo/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `OUTPUTS`, `beatsFor`, `compose`, `readManifest`, `renderFrames`, `encodeFrames`.
- Produces:
  - `selectOutputs(args: string[]): typeof OUTPUTS` — filters by `--audience`, `--ratio`, `--cut`; no flags = all ten
  - `renderOutput(browser: Browser, o: Output, env: { promoMusic?: string }): Promise<{ file: string; bytes: number; frames: number }>` — reads and checks the manifest for `o.audience`, renders each beat in order into one encoder stream, writes to a temp name and renames on success, throws `over 16 MB` if larger, throws if `promoMusic` is set and the file does not exist
  - CLI `npm run promo:render -- [flags]`: deletes the selected outputs first, prints one line per file (name, seconds, MB)

- [ ] **Step 1: Write failing tests** — `selectOutputs([])` has 10 entries; `["--audience","garage","--ratio","9x16"]` has 2; `["--cut","short"]` has 4; unknown flag value throws. With synthetic captures in a temp `out` dir: rendering a short-cut output yields a file whose ffprobe-free duration check (`frames === frameCount(totalMs("short"))`) holds; a manifest for the wrong audience makes `renderOutput` reject and leaves no file; a non-existent `promoMusic` path rejects.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Real render.** `npm run promo:render`. Expected: ten files in `out/promo/`, each under 16 MB, full cuts 35–40 s, short cuts 15 s.
- [ ] **Step 6: Commit** `feat(promo): render all outputs`

### Task 7: Frame review, README, hand-off

**Files:**
- Modify: `training/README.md` (a "Promo video" section: the two commands, what is real and what is illustrated, how to change copy, how to add a beat, how to supply car photos and music), `docs/app-map.md` (one line)

- [ ] **Step 1:** Extract one frame per beat from every output (ffmpeg `-ss`). Review each for: copy inside the safe area and unclipped; Hebrew order and fonts; captures sharp; demo data only; garage frames show no legible "סוכן"; end card readable at phone size (view the 9:16 frame scaled to 360 px wide). If `fixtures/promo/user/` was used, inspect every photo and every frame showing one for plates and people.
- [ ] **Step 2:** Fix what the review finds (each fix with a failing test first where a test can express it), re-render, re-review the affected frames.
- [ ] **Step 3:** Run `npm run promo:render` a second time. Expected: same ten files, same frame counts.
- [ ] **Step 4:** `npm test`, `npm run typecheck` — Expected: PASS, clean. Paste the output in the hand-off.
- [ ] **Step 5: Commit** `docs(promo): README and app-map`, push, open the PR against `main`, send the ten files to the user with the copy table for wording review.
