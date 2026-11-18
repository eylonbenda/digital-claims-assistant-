import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoClaim } from "./demo.ts";
import { loadEnv, OUT_DIR, TRAINING_ROOT, type Env } from "./env.ts";
import { clearPreviousOutputs } from "./outputs.ts";
import { validateScene, type Scene, type Segment } from "./scene.ts";
import { MARKER_CLIENT_NAME, seed } from "./seed.ts";
import { holdMs } from "./stage/pacing.ts";
import { attachStage, type Surface } from "./stage/stage.ts";

/** `backdrop`: the caption panel recorded beside a phone clip. */
export type RecordedSegment = { surface: Surface; file: string; backdrop?: string };

export const VIEWPORT: Record<Surface, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 720 }, // short enough to stay readable when scaled into a 720p frame
};
const STEP_TIMEOUT_MS = 15_000;
const SEGMENT_DIR = path.join(OUT_DIR, "segments");
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

// Logs the demo agent in off-camera and proves the app reads the database the seed wrote.
async function loginAndCheckDatabase(browser: Browser, env: Env, markerPhone: string): Promise<string> {
  const ctx = await browser.newContext({ viewport: VIEWPORT.desktop, locale: "he-IL" });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    await page.goto(`${env.baseUrl}/login`);
    await page.getByLabel("אימייל").fill(env.demoEmail);
    await page.getByLabel("סיסמה").fill(env.demoPassword);
    await page.getByRole("button", { name: "כניסה" }).click();
    try {
      await page.waitForURL("**/dashboard**");
    } catch {
      throw new Error("could not log in as the demo agent — check DEMO_AGENT_EMAIL / DEMO_AGENT_PASSWORD in training/.env.local");
    }
    try {
      // The phone is new on every run: an old seed in another database cannot satisfy this.
      await page.getByText(markerPhone).first().waitFor({ state: "visible" });
    } catch {
      throw new Error(
        `app and seed use different databases: "${MARKER_CLIENT_NAME}" is not on the dashboard at ${env.baseUrl}. ` +
          "The app's web/.env.local must point at the same Supabase project as training/.env.local.",
      );
    }
    const file = path.join(SEGMENT_DIR, "auth.json");
    await ctx.storageState({ path: file });
    return file;
  } finally {
    await ctx.close();
  }
}

async function newSegmentContext(browser: Browser, seg: Segment, authState: string): Promise<BrowserContext> {
  const viewport = VIEWPORT[seg.surface];
  const ctx = await browser.newContext({
    viewport,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    recordVideo: { dir: SEGMENT_DIR, size: viewport },
    acceptDownloads: true,
    ...(seg.surface === "phone"
      ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA }  // the client is not logged in
      : { storageState: authState }),
  });
  // The plate lookup is the one app dependency that is stubbed: a made-up plate must not
  // hit the government registry, and must not come back as a real car.
  await ctx.route("**/api/vehicle/**", (route) =>
    route.fulfill({
      json: { vehicle: { description: `${demoClaim.vehicle.manufacturer} ${demoClaim.vehicle.model}`, year: demoClaim.vehicle.year } },
    }),
  );
  return ctx;
}

const SIDE_HTML = `<html><body style="margin:0;background:#182438"></body></html>`;

// A page the size of the final frame, recorded next to a phone clip: it carries the
// captions (and, before the phone appears, the chapter title).
async function newSidePage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT.desktop, recordVideo: { dir: SEGMENT_DIR, size: VIEWPORT.desktop } });
  const page = await ctx.newPage();
  await page.setContent(SIDE_HTML);
  return { ctx, page };
}

async function recordTitleClip(browser: Browser, title: string): Promise<RecordedSegment> {
  const { ctx, page } = await newSidePage(browser);
  const stage = await attachStage(page, "desktop");
  await stage.titleCard(title);
  const video = page.video()!;
  await ctx.close();
  return { surface: "desktop", file: await video.path() };
}

export async function recordScene(scene: Scene, env: Env): Promise<RecordedSegment[]> {
  const errs = validateScene(scene);
  if (errs.length) throw new Error(`scene ${scene.id} is invalid: ${errs.join("; ")}`);

  const { markerPhone } = await seed(env); // guards the target first, then resets the demo agent
  fs.rmSync(SEGMENT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEGMENT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const recorded: RecordedSegment[] = [];
  const shared: Record<string, string> = {};
  let stepName = "login";
  let ctx: BrowserContext | null = null;
  let side: { ctx: BrowserContext; page: Page } | null = null;
  try {
    const authState = await loginAndCheckDatabase(browser, env, markerPhone);
    for (const seg of scene.segments) {
      const phone = seg.surface === "phone";
      // A phone clip gets its chapter card as a clip of its own, full frame.
      if (phone && seg.title) recorded.push(await recordTitleClip(browser, seg.title));
      side = phone ? await newSidePage(browser) : null; // started back-to-back with the phone so the two stay in step
      ctx = await newSegmentContext(browser, seg, authState);
      const page = await ctx.newPage();
      page.setDefaultTimeout(STEP_TIMEOUT_MS);
      const stage = await attachStage(page, seg.surface, { captionPage: side?.page });
      try {
        if (seg.title && !phone) await stage.titleCard(seg.title);
        for (const step of seg.steps) {
          stepName = step.name;
          console.log(`  · ${step.name}`);
          const c = { page, stage, demo: demoClaim, env, shared };
          await step.before?.(c);
          if (step.caption !== undefined) await stage.caption(step.caption);
          const started = Date.now();
          await step.run(c);
          // The caption was readable while the step ran; only top up what is left.
          await stage.hold(step.caption ? Math.max(700, holdMs(step.caption) - (Date.now() - started)) : 400);
        }
      } catch (err) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(OUT_DIR, `failed-${stepName}.png`) }).catch(() => undefined);
        throw err;
      }
      const video = page.video();
      const sideVideo = side?.page.video();
      await ctx.close(); // flushes the video file
      await side?.ctx.close();
      ctx = null;
      side = null;
      if (!video) throw new Error("recording produced no video");
      recorded.push({ surface: seg.surface, file: await video.path(), ...(sideVideo ? { backdrop: await sideVideo.path() } : {}) });
    }
    return recorded;
  } catch (err) {
    await ctx?.close().catch(() => undefined);
    await side?.ctx.close().catch(() => undefined);
    // A failed run leaves nothing that could be mistaken for a finished video.
    fs.rmSync(SEGMENT_DIR, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new Error(`step "${stepName}" failed: ${msg}`);
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error("usage: npm run record -- <scene id>   (a file name in training/videos/, without .ts)");
  const file = path.join(TRAINING_ROOT, "videos", `${id}.ts`);
  if (!fs.existsSync(file)) throw new Error(`no scene at videos/${id}.ts`);
  const scene = (await import(pathToFileURL(file).href)).default as Scene;
  const env = loadEnv();
  console.log(`recording ${scene.id} against ${env.baseUrl}`);
  const out = path.join(OUT_DIR, `${scene.id}.mp4`);
  clearPreviousOutputs(OUT_DIR, scene.id);
  const segments = await recordScene(scene, env);
  const { composeVideo } = await import("./compose.ts");
  await composeVideo(segments, out);
  fs.rmSync(SEGMENT_DIR, { recursive: true, force: true });
  console.log(`done: ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
