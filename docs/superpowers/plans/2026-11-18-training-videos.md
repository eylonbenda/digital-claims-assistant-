# Training Videos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `training/` package whose one command drives the dev app with Playwright on seeded demo data and renders `training/out/01-accident-notice.mp4`, a captioned Hebrew walkthrough from opening a claim to the filled accident notice.

**Architecture:** A *scene* is data: ordered segments (desktop or phone), each an ordered list of captioned steps. `record.ts` runs each segment in its own Playwright context with `recordVideo`, using in-page "stage" overlays (caption bar, fake cursor, title cards). `compose.ts` pads phone segments, concatenates, and encodes mp4 with `ffmpeg-static`. `seed.ts` resets a dedicated demo agent in dev Supabase before every run.

**Tech Stack:** Node + TypeScript run via `tsx`, `playwright` (Chromium), `ffmpeg-static`, `pdfjs-dist`, `@supabase/supabase-js`, `dotenv`. Tests: `node --test` through `tsx` (same runner style as `web/scripts/__tests__`).

**Spec:** `docs/superpowers/specs/2026-11-18-training-videos-design.md` — read it first.

## Global Constraints

- Work on branch `feat/training-videos` off `origin/main`, in a worktree; PR with `--base main`. Never commit to `main`.
- Nothing is added to `web/package.json`. A change under `web/` is allowed only as a `data-testid` addition, in its own separate PR.
- Never record against prod. Never print or commit credentials. `training/.env.local` and `training/out/` are git-ignored.
- No real personal data in any frame: all typed values come from `demoClaim`; uploads come from `training/fixtures/`.
- Only two things are stubbed: `GET /api/vehicle/*` (Playwright `route`) and the `wa.me` navigation (never followed). Every screen shown is the real app.
- Selectors are role / label / visible Hebrew text. No CSS-class selectors.
- A failed step produces a screenshot and a non-zero exit, and **no mp4**.
- Output: 1280×720, H.264, yuv420p, 30 fps, faststart, silent audio track, under 16 MB, 3–4 minutes.
- Desktop viewport 1280×720; phone viewport 390×844, locale `he-IL`.
- This is Next.js 16 — no Next code is written here, but read `web/AGENTS.md` before touching `web/`.
- No DB migration.

**One deviation from the spec, decided here:** the filled PDF is shown by rendering the real downloaded PDF with `pdfjs-dist` in a local viewer page that Playwright records while scrolling, instead of rasterising pages and panning in ffmpeg. Same on-screen result, less ffmpeg code.

## Review Focus

1. **App not running or wrong port** → the run exits before seeding with "no app at `<BASE_URL>`", not a Playwright timeout stack. (Task 1)
2. **The app is pointed at a different database than the seed** (e.g. `web/.env.local` → prod) → the run aborts before recording because the marker claim is not on the dashboard. (Task 4)
3. **Re-run after a failed or interrupted run** → seed leaves exactly the same starting state; a second consecutive run succeeds. (Task 2)
4. **Caption covers the control being demonstrated** — the wizard's nav buttons sit at the bottom of the phone screen → captions render at the **top** on phone, bottom on desktop. (Task 3)
5. **Mixed Hebrew + digits/Latin in a caption** ("טופס PDF", phone numbers) renders in correct order → caption element is `dir="rtl"` with `unicode-bidi: plaintext`; checked in the frame review. (Task 3, Task 8)

---

### Task 1: Package scaffold, target guard, demo data

**Files:**
- Create: `training/package.json`, `training/tsconfig.json`, `training/.env.example`, `training/.gitignore`
- Create: `training/src/env.ts`, `training/src/guard.ts`, `training/src/demo.ts`
- Test: `training/src/__tests__/guard.test.ts`, `training/src/__tests__/demo.test.ts`

**Interfaces — produces:**
```ts
// env.ts
export type Env = { baseUrl: string; supabaseUrl: string; serviceRoleKey: string;
  demoEmail: string; demoPassword: string; prodSupabaseUrl: string | null };
export function loadEnv(): Env;            // reads training/.env.local, throws naming the missing key (never its value)

// guard.ts
export function checkTarget(i: { baseUrl: string; versionEnv: string | null;
  supabaseUrl: string; prodSupabaseUrl: string | null }): { ok: true } | { ok: false; reason: string };
export async function assertSafeTarget(env: Env): Promise<void>;  // fetches `${baseUrl}/api/version`, throws on !ok

// demo.ts
export const demoClaim: DemoClaim;         // client, insured, vehicle, thirdParty, accident — all fictional
export function isValidIsraeliId(id: string): boolean;
```
`package.json` scripts: `record` → `tsx src/record.ts`, `seed` → `tsx src/seed.ts`, `test` → `node --import tsx --test src/__tests__/*.test.ts`. `.env.example` keys: `BASE_URL=http://localhost:3100`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_AGENT_EMAIL`, `DEMO_AGENT_PASSWORD`, `PROD_SUPABASE_URL`.

- [ ] **Step 1: Write failing tests**

```ts
// guard.test.ts
const base = { baseUrl: "http://localhost:3100", versionEnv: "local",
  supabaseUrl: "https://dev.supabase.co", prodSupabaseUrl: "https://prod.supabase.co" };
test("local dev target passes", () => assert.deepEqual(checkTarget(base), { ok: true }));
test("127.0.0.1 passes", () => assert.equal(checkTarget({ ...base, baseUrl: "http://127.0.0.1:3101" }).ok, true));
test("non-local host is refused", () => assert.equal(checkTarget({ ...base, baseUrl: "https://app.example.com" }).ok, false));
test("production env is refused", () => assert.equal(checkTarget({ ...base, versionEnv: "production" }).ok, false));
test("unreachable app is refused with the URL in the reason", () => {
  const r = checkTarget({ ...base, versionEnv: null });
  assert.equal(r.ok, false); assert.match((r as any).reason, /localhost:3100/);
});
test("seed pointed at prod is refused", () =>
  assert.equal(checkTarget({ ...base, supabaseUrl: "https://prod.supabase.co" }).ok, false));
test("trailing slash / case differences still match the denylist", () =>
  assert.equal(checkTarget({ ...base, supabaseUrl: "https://PROD.supabase.co/" }).ok, false));

// demo.test.ts
test("demo ID is 9 digits and checksum-valid", () => {
  assert.match(demoClaim.insured.id_number, /^\d{9}$/);
  assert.ok(isValidIsraeliId(demoClaim.insured.id_number));
});
test("demo plates are 7–8 digits", () => {
  for (const p of [demoClaim.vehicle.plate, demoClaim.thirdParty.plate]) assert.match(p, /^\d{7,8}$/);
});
test("checksum rejects a wrong digit", () => assert.equal(isValidIsraeliId("123456789"), false));
```

- [ ] **Step 2: Run** `cd training && npm install && npm test` — expected: FAIL, modules not found.
- [ ] **Step 3: Implement** `env.ts`, `guard.ts`, `demo.ts`. `isValidIsraeliId` must agree with `web/src/lib/validation/il.ts` (read it; do not import across packages). `demoClaim` field names mirror the wizard `State` in `web/src/lib/collection/claim-state.ts`. Scenario per spec §4: own policy, insured is the driver, third party present with known details, no injuries, insurer הראל. `assertSafeTarget` treats a failed fetch as `versionEnv: null`.
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Commit** `feat(training): package scaffold, target guard, demo data`.

### Task 2: Seed — demo agent, cleanup, marker

**Files:**
- Create: `training/src/seed.ts`

**Interfaces:**
- Consumes: `loadEnv`, `assertSafeTarget`.
- Produces:
```ts
export const MARKER_CLIENT_NAME = "דנה לוי (הדגמה)";
export async function seed(env: Env): Promise<{ agentId: string }>;
```

Behaviour, in order: (1) `assertSafeTarget`; (2) find or create the auth user `demoEmail` (admin API, `email_confirm: true`) — the trigger in `web/db/migrations/001_agent_setup.sql` creates the `agents` row; set `agents.name = "מוסך הדגמה"`; (3) delete storage objects of that agent's claims, then delete its `claims` rows (children cascade, see `web/db/schema.sql`) — every query filtered by that one `agent_id`; (4) insert filler claims: the marker claim (`MARKER_CLIENT_NAME`, status submitted) plus two more fictional claims in other statuses, so the dashboard is not empty. Read the storage bucket name and claim columns from `web/db/schema.sql` + migration `003`.

- [ ] **Step 1: Implement** `seed.ts` (also runnable as CLI: prints `seeded agent <id>, 3 claims`, nothing secret).
- [ ] **Step 2: Verify against dev.** Run `npm run seed` twice. Expected both times: exit 0 and the same output. Then query dev (Supabase MCP `execute_sql` if connected, else ask the user to run it): `select count(*) from claims where agent_id = '<id>'` → `3`.
- [ ] **Step 3: Verify the guard is wired.** Run `BASE_URL=https://example.com npm run seed` → non-zero exit, reason mentions the host, and the claim count is unchanged.
- [ ] **Step 4: Commit** `feat(training): seed demo agent and reset its claims`.

### Task 3: Stage — captions, cursor, title cards

**Files:**
- Create: `training/src/stage/pacing.ts`, `training/src/stage/overlay.ts` (browser-side script + CSS as a string), `training/src/stage/stage.ts`
- Test: `training/src/__tests__/pacing.test.ts`, `training/src/__tests__/stage.smoke.test.ts`

**Interfaces — produces:**
```ts
// pacing.ts
export function holdMs(caption: string): number;   // clamp(1800, 1200 + 55 * chars, 6000)

// stage.ts
export type Surface = "desktop" | "phone";
export type Stage = {
  titleCard(text: string, ms?: number): Promise<void>;   // full-frame card, default 2500 ms
  caption(text: string): Promise<void>;                   // shows text, does not wait
  hold(ms?: number): Promise<void>;                       // default: holdMs(current caption)
  click(target: Locator): Promise<void>;                  // scroll into view, glide cursor, ripple, real click
  type(target: Locator, text: string): Promise<void>;     // click, then type at 60 ms/char
  highlight(target: Locator, ms?: number): Promise<void>; // ring around the element, no click
};
export async function attachStage(page: Page, surface: Surface): Promise<Stage>;
```
`attachStage` uses `page.addInitScript` so the overlay survives navigations, and re-shows the current caption after each load. Overlay root: `position: fixed; pointer-events: none; z-index: 2147483647`. Caption: `dir="rtl"`, `unicode-bidi: plaintext`, **top** of the frame on `phone`, bottom on `desktop`. Colours taken from the app's CSS variables in `web/src/app/globals.css`.

- [ ] **Step 1: Write failing tests**

```ts
// pacing.test.ts
test("short caption gets the floor", () => assert.equal(holdMs("שלום"), 1800));
test("scales with length", () => assert.equal(holdMs("א".repeat(40)), 1200 + 55 * 40));
test("long caption is capped", () => assert.equal(holdMs("א".repeat(500)), 6000));

// stage.smoke.test.ts — launches Chromium on page.setContent('<button>אישור</button>')
test("caption text is in the DOM, rtl, and at the top on phone", async () => {
  // attachStage(page,"phone"); await stage.caption("טופס PDF מוכן");
  // el = [data-stage-caption]; assert textContent === "טופס PDF מוכן"; dir === "rtl";
  // boundingBox().y < 844 / 2
});
test("caption is at the bottom on desktop", async () => { /* boundingBox().y > 720 / 2 */ });
test("overlay never intercepts clicks", async () => {
  // stage.caption(...); stage.click(button) → button's click handler fired
});
test("caption survives a navigation", async () => {
  // caption, page.goto(second data: URL) → caption element present with same text
});
```

- [ ] **Step 2: Run** `npx playwright install chromium && npm test` — expected: new tests FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Commit** `feat(training): stage overlays and pacing`.

### Task 4: Scene model and recorder

**Files:**
- Create: `training/src/scene.ts`, `training/src/record.ts`, `training/videos/00-smoke.ts`
- Test: `training/src/__tests__/scene.test.ts`

**Interfaces:**
- Consumes: `seed`, `MARKER_CLIENT_NAME`, `attachStage`, `Stage`, `Surface`, `demoClaim`, `Env`.
- Produces:
```ts
// scene.ts
export type StepCtx = { page: Page; stage: Stage; demo: DemoClaim; env: Env;
  shared: Record<string, string> };        // cross-segment values, e.g. shared.clientUrl, shared.pdfPath
export type Step = { name: string; caption?: string; run: (c: StepCtx) => Promise<void> };
export type Segment = { surface: Surface; title?: string; steps: Step[] };  // title → titleCard before step 1
export type Scene = { id: string; segments: Segment[] };
export function validateScene(s: Scene): string[];   // [] when valid

// record.ts
export type RecordedSegment = { surface: Surface; file: string };  // .webm path
export async function recordScene(scene: Scene, env: Env): Promise<RecordedSegment[]>;
```
`recordScene` order: `seed(env)` → log in the demo agent in a **non-recorded** desktop context via the real `/login` form and save `storageState` → **same-database check**: open `/dashboard` with that state and require `MARKER_CLIENT_NAME` to be visible, else throw "app and seed use different databases" → for each segment: new context (`recordVideo` sized to the viewport; desktop gets the storage state, phone gets none), `route("**/api/vehicle/**")` fulfilled with the fictional vehicle from `demoClaim`, `attachStage`, title card, then per step: `caption` → `run` → `hold`. Default step timeout 15 s. On any error: screenshot to `training/out/failed-<step name>.png`, close contexts, delete the segment files, rethrow with the step name. CLI: `npm run record -- <scene id>` imports `videos/<id>.ts` (default export `Scene`), records, then calls `composeVideo` (Task 5).

- [ ] **Step 1: Write failing tests**

```ts
test("valid scene has no errors", () => assert.deepEqual(validateScene(ok), []));
test("empty segments is an error", () => assert.equal(validateScene({ id: "x", segments: [] }).length, 1));
test("segment without steps is an error", () => { /* length 1, message names the segment index */ });
test("duplicate step names are an error", () => { /* failed-<name>.png must be unambiguous */ });
```

- [ ] **Step 2: Run** `npm test` — expected: FAIL.
- [ ] **Step 3: Implement** `scene.ts`, `record.ts`, and `videos/00-smoke.ts` (one desktop segment: open `/dashboard`, caption "זה לוח הבקרה", highlight the new-claim form).
- [ ] **Step 4: Run** `npm test` — expected: pass.
- [ ] **Step 5: Verify live.** Start the app (README route; from a worktree: copy `web/.env.local`, `npm run build`, `npm run start -- --port 3101`, set `BASE_URL`). Run `npm run record -- 00-smoke` with compose temporarily skipped → one `.webm` exists and, opened, shows the dashboard with the caption and cursor.
- [ ] **Step 6: Verify failure path.** Stop the app and run again → exits non-zero with "no app at …" and no files in `out/`. Restart; temporarily break a selector in `00-smoke` → non-zero exit, `out/failed-<step>.png` exists, no `.webm` left. Revert.
- [ ] **Step 7: Commit** `feat(training): scene model and recorder`.

### Task 5: Compose to mp4

**Files:**
- Create: `training/src/compose.ts`
- Test: `training/src/__tests__/compose.test.ts`

**Interfaces:**
- Consumes: `RecordedSegment`.
- Produces:
```ts
export function buildFfmpegArgs(segments: RecordedSegment[], outPath: string, bg: string): string[];
export async function composeVideo(segments: RecordedSegment[], outPath: string): Promise<void>;
```
One ffmpeg invocation with `filter_complex`: each phone input is scaled to height 680 and overlaid centred on a 1280×720 colour source `bg` with a rounded outline; each desktop input is scaled to 1280×720; all normalised to 30 fps and `concat`-ed; `anullsrc` supplies silent audio; flags `-c:v libx264 -pix_fmt yuv420p -movflags +faststart -shortest`.

- [ ] **Step 1: Write failing tests**

```ts
const segs = [{ surface: "desktop", file: "a.webm" }, { surface: "phone", file: "b.webm" }, { surface: "desktop", file: "c.webm" }];
const args = buildFfmpegArgs(segs, "out.mp4", "#0f172a");
test("inputs keep scene order", () => assert.deepEqual(args.filter((_, i) => args[i - 1] === "-i").slice(0, 3), ["a.webm", "b.webm", "c.webm"]));
test("concat covers all segments", () => assert.match(args.join(" "), /concat=n=3:v=1:a=0/));
test("only the phone segment is overlaid on the background", () => assert.equal((args.join(" ").match(/overlay=/g) ?? []).length, 1));
test("whatsapp-safe encode flags", () => { for (const f of ["libx264", "yuv420p", "+faststart"]) assert.ok(args.includes(f)); });
test("output path is last", () => assert.equal(args.at(-1), "out.mp4"));
test("no segments throws", () => assert.throws(() => buildFfmpegArgs([], "out.mp4", "#000")));
```

- [ ] **Step 2: Run** `npm test` — expected: FAIL.
- [ ] **Step 3: Implement** `compose.ts`; spawn the `ffmpeg-static` binary; on non-zero exit throw with the last 20 lines of stderr and delete a partial `outPath`.
- [ ] **Step 4: Run** `npm test` — expected: pass.
- [ ] **Step 5: Verify live.** `npm run record -- 00-smoke` → `out/00-smoke.mp4` plays; `ffmpeg -i` reports h264, 1280x720, 30 fps, an audio stream.
- [ ] **Step 6: Commit** `feat(training): compose segments into mp4`.

### Task 6: Fixtures and PDF viewer

**Files:**
- Create: `training/src/make-fixtures.ts`, `training/fixtures/*.png` (generated, committed), `training/src/stage/pdf-viewer.ts`

**Interfaces — produces:**
```ts
// fixtures: licence-front.png, licence-back.png, registration.png, car-1.png, car-2.png, car-3.png
export const FIXTURES: Record<"licenceFront" | "licenceBack" | "registration" | "car1" | "car2" | "car3", string>; // absolute paths
// pdf-viewer.ts
export async function showPdf(page: Page, pdfPath: string, stage: Stage): Promise<void>;
// renders every page of pdfPath with pdfjs-dist onto canvases in a neutral page, then scrolls top→bottom over ~8 s
```
Fixtures are produced by Playwright screenshots of small HTML cards (no new image dependency): each is a plain mock document with a large diagonal "דוגמה" stamp and only `demoClaim` values. They must pass the app's magic-byte sniff (`web/src/lib/files/sniff.ts`) — real PNG output does.

- [ ] **Step 1: Implement** `make-fixtures.ts` (script `npm run fixtures`) and generate the six files.
- [ ] **Step 2: Verify** each file opens, shows the stamp, and contains no value that is not in `demoClaim` (Read each image).
- [ ] **Step 3: Implement** `showPdf`. Verify with `web/scripts/fill.ts` output for הראל: add a throwaway segment to `00-smoke` calling `showPdf` → recorded frames show the Hebrew form, legible, in correct order.
- [ ] **Step 4: Commit** `feat(training): fictional upload fixtures and PDF viewer`.

### Task 7: Video 1 scene

**Files:**
- Create: `training/videos/01-accident-notice.ts`
- Possibly modify (separate PR only): `web/` to add a `data-testid` where an element has no role/label/text handle.

**Interfaces:** consumes `Scene`, `Segment`, `Step`, `StepCtx`, `FIXTURES`, `showPdf`, `demoClaim`. Default export: `Scene` with `id: "01-accident-notice"`.

Read before writing: `web/src/app/dashboard/NewClaimForm.tsx`, `web/src/components/collection/steps.ts` + `steps/*`, `web/src/app/dashboard/[id]/FormGenerator.tsx`, `FormFieldEditor.tsx`, and the cockpit tab strip. Segments, in order:

| # | Surface | Title card | Steps |
|---|---|---|---|
| 1 | desktop | פתיחת תיק | dashboard overview → type client name + phone → create |
| 2 | desktop | שליחת הקישור ללקוח | highlight the WhatsApp send button (do not click through) → read the client URL from the link shown, store `shared.clientUrl` |
| 3 | phone | הצד של הלקוח | open `shared.clientUrl` → intro + consent → the four tap steps under **one** caption → vehicle (plate lookup fills make/model) → insured → third-party details → when/where → description → documents (`setInputFiles` with `FIXTURES`) → summary → submit → confirmation screen |
| 4 | desktop | טופס ההודעה | dashboard shows the claim as submitted → open the cockpit → tab "טופס ההודעה" → edit one field and save → click generate for הראל, capture the download to `shared.pdfPath` → `showPdf` with caption "הטופס המלא, מוכן לשליחה" → end card |

Caption text is a first draft in plain second-person Hebrew, one short sentence each, no jargon; the user reviews wording in the first cut. The generate button opens a new tab — capture it with `context.waitForEvent("page")`/`download` or fetch the same URL with the context's cookies via `context.request.get`, whichever yields the real bytes; do not navigate the recorded page to the PDF.

- [ ] **Step 1: Write segments 1–2**, run `npm run record -- 01-accident-notice` with segments 3–4 stubbed out → passes; `shared.clientUrl` matches `/c/<token>`.
- [ ] **Step 2: Write segment 3**, run → the wizard reaches the confirmation screen; in dev the claim's status is submitted and 6 documents are stored.
- [ ] **Step 3: Write segment 4**, run → `shared.pdfPath` is a PDF > 10 KB containing the demo client's name on page 1 (check by reading the rendered viewer frame).
- [ ] **Step 4: Run the full scene twice in a row** → both succeed (proves seed reset); `out/01-accident-notice.mp4` exists.
- [ ] **Step 5: Commit** `feat(training): video 1 — open claim to accident notice`.

### Task 8: Frame review, length, README, handoff

**Files:**
- Create: `training/README.md`
- Modify: `docs/app-map.md` (one row/paragraph pointing at `training/`), `.gitignore` if needed.

- [ ] **Step 1: Extract review frames.** `ffmpeg -i out/01-accident-notice.mp4 -vf fps=1/3 out/frames/f-%03d.png`, then Read the frames. Check each against: correct screen for the caption; caption legible and not covering the control in use; Hebrew and mixed Hebrew/Latin/digits in correct order; nothing outside `demoClaim`/fixtures visible (including the filler claims and the browser chrome); cursor visible on clicks. Fix and re-record until clean.
- [ ] **Step 2: Check the numbers.** `ffmpeg -i` → duration between 3:00 and 4:00, 1280x720, h264, file < 16 MB. Over 4:00: first shorten holds on tap steps; if still over, move segment 3 into `videos/02-client-side.ts` and tell the user.
- [ ] **Step 3: Write `README.md`:** prerequisites, creating `training/.env.local`, starting the app (main checkout and worktree prod-build routes), `npm run record -- <id>`, how to add a video (copy a scene file), what the guard refuses and why, troubleshooting (`failed-<step>.png`).
- [ ] **Step 4: Run** `npm test` and paste the output in the PR. Run `git status` → no `.env.local`, no `out/`.
- [ ] **Step 5: Commit, push, open PR** `feat: scripted training videos — video 1` with `--base main`. Send the mp4 to the user (it is not committed).
