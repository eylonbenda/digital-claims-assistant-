import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoClaim } from "./demo.ts";
import { loadEnv, OUT_DIR, TRAINING_ROOT, type Env } from "./env.ts";
import { validateScene, type Scene, type Segment } from "./scene.ts";
import { MARKER_CLIENT_NAME, seed } from "./seed.ts";
import { attachStage, type Surface } from "./stage/stage.ts";

export type RecordedSegment = { surface: Surface; file: string };

export const VIEWPORT: Record<Surface, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 844 },
};
const STEP_TIMEOUT_MS = 15_000;
const SEGMENT_DIR = path.join(OUT_DIR, "segments");
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

// Logs the demo agent in off-camera and proves the app reads the database the seed wrote.
async function loginAndCheckDatabase(browser: Browser, env: Env): Promise<string> {
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
      await page.getByText(MARKER_CLIENT_NAME).first().waitFor({ state: "visible" });
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

export async function recordScene(scene: Scene, env: Env): Promise<RecordedSegment[]> {
  const errs = validateScene(scene);
  if (errs.length) throw new Error(`scene ${scene.id} is invalid: ${errs.join("; ")}`);

  await seed(env); // guards the target first, then resets the demo agent
  fs.rmSync(SEGMENT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEGMENT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const recorded: RecordedSegment[] = [];
  const shared: Record<string, string> = {};
  let stepName = "login";
  let ctx: BrowserContext | null = null;
  try {
    const authState = await loginAndCheckDatabase(browser, env);
    for (const seg of scene.segments) {
      ctx = await newSegmentContext(browser, seg, authState);
      const page = await ctx.newPage();
      page.setDefaultTimeout(STEP_TIMEOUT_MS);
      const stage = await attachStage(page, seg.surface);
      try {
        if (seg.title) await stage.titleCard(seg.title);
        for (const step of seg.steps) {
          stepName = step.name;
          console.log(`  · ${step.name}`);
          if (step.caption !== undefined) await stage.caption(step.caption);
          await step.run({ page, stage, demo: demoClaim, env, shared });
          await stage.hold(step.caption ? undefined : 400);
        }
      } catch (err) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(OUT_DIR, `failed-${stepName}.png`) }).catch(() => undefined);
        throw err;
      }
      const video = page.video();
      await ctx.close(); // flushes the video file
      ctx = null;
      if (!video) throw new Error("recording produced no video");
      recorded.push({ surface: seg.surface, file: await video.path() });
    }
    return recorded;
  } catch (err) {
    await ctx?.close().catch(() => undefined);
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
  const segments = await recordScene(scene, env);
  const out = path.join(OUT_DIR, `${scene.id}.mp4`);
  const { composeVideo } = await import("./compose.ts");
  await composeVideo(segments, out);
  fs.rmSync(SEGMENT_DIR, { recursive: true, force: true });
  console.log(`done: ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
