import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { OUT_DIR } from "../src/env.ts";
import { REQUIRED_FAMILIES } from "./fonts.ts";
import { FPS, RATIOS, SIZE, frameCount, frameTimeMs, type Ratio } from "./timeline.ts";

// A full HTML document whose motion is CSS animations / Web Animations only. Nothing in it
// may depend on wall-clock time: the renderer sets every animation's clock itself.
export type Composition = { html: string; durationMs: number };

// Scripts go to the page as strings: tsx rewrites function bodies in a way that does not
// survive serialisation.
const LOAD_FONTS = `(async () => {
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
  await document.fonts.ready;
  const name = (f) => f.family.replace(/["']/g, "");
  const faces = [...document.fonts];
  return {
    loaded: [...new Set(faces.filter((f) => f.status === "loaded").map(name))],
    failed: [...new Set(faces.filter((f) => f.status !== "loaded").map((f) => name(f) + " " + f.weight))],
  };
})()`;

// Every picture must have decoded: a broken capture would otherwise render as a blank screen.
const LOAD_IMAGES = `(async () => {
  await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
  return [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length;
})()`;

const seek = (ms: number) => `(() => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${ms}; }
})()`;

// Loads a composition at the output size and freezes it at t=0.
export async function prepare(page: Page, comp: Composition, ratio: Ratio): Promise<void> {
  await page.setViewportSize(SIZE[ratio]);
  await page.setContent(comp.html, { waitUntil: "load" });
  // One missing weight is enough to refuse: Chromium would fake it and the video would
  // ship in the wrong letterforms without anyone being told.
  const fonts = (await page.evaluate(LOAD_FONTS)) as { loaded: string[]; failed: string[] };
  if (fonts.failed.length) throw new Error(`font not loaded: ${fonts.failed.join(", ")}`);
  for (const family of REQUIRED_FAMILIES) {
    if (!fonts.loaded.includes(family)) throw new Error(`font not loaded: ${family}`);
  }
  const broken = Number(await page.evaluate(LOAD_IMAGES));
  if (broken > 0) throw new Error(`picture failed to load (${broken}) — capture again with \`npm run promo:capture\``);
  await page.evaluate(seek(0));
}

export async function frameAt(page: Page, ms: number): Promise<Buffer> {
  await page.evaluate(seek(ms));
  return page.screenshot({ type: "jpeg", quality: 95 });
}

export async function renderFrames(
  page: Page, comp: Composition, ratio: Ratio,
  onFrame: (image: Buffer, index: number) => Promise<void>,
): Promise<number> {
  await prepare(page, comp, ratio);
  const n = frameCount(comp.durationMs);
  for (let i = 0; i < n; i++) await onFrame(await frameAt(page, frameTimeMs(i)), i);
  return n;
}

export type EncodeOpts = { music?: string; durationMs: number };

export function buildEncodeArgs(outPath: string, ratio: Ratio, opts: EncodeOpts): string[] {
  const { width, height } = SIZE[ratio];
  const seconds = opts.durationMs / 1000;
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  ];
  if (opts.music) {
    // Looped, so a track shorter than the video still reaches the fade at the end; `-t`
    // below cuts a longer one.
    const fade = Math.min(1.5, seconds / 2);
    args.push("-stream_loop", "-1", "-i", opts.music, "-af", `afade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade}`);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"); // some players dislike video-only files
  }
  args.push(
    "-map", "0:v", "-map", "1:a",
    // HD video is BT.709. Converted and tagged as such, or players shift the brand colours.
    "-vf", `scale=${width}:${height}:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", opts.music ? "128k" : "32k",
    "-t", seconds.toFixed(3),
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}

// Runs ffmpeg and hands `feed` a writer for the frames. A failure removes the output.
export async function encodeFrames(
  outPath: string, ratio: Ratio,
  feed: (write: (image: Buffer) => Promise<void>) => Promise<void>,
  opts: EncodeOpts,
): Promise<void> {
  if (!ffmpegPath) throw new Error("promo: ffmpeg-static has no binary for this platform");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const proc = spawn(ffmpegPath as unknown as string, buildEncodeArgs(outPath, ratio, opts), { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += String(d); });
  proc.stdin.on("error", () => { /* ffmpeg exited early; the close handler reports it */ });
  const closed = new Promise<number | null>((resolve, reject) => { proc.on("error", reject); proc.on("close", resolve); });
  // A frame is written when ffmpeg has taken it. If ffmpeg dies first (disk full, killed, bad
  // arguments) the pipe never drains, so each write also listens for the process ending.
  let ended = false;
  proc.on("close", () => { ended = true; });
  const died = () => new Error(`ffmpeg exited before the video was finished:\n${stderr.trim().split("\n").slice(-20).join("\n")}`);
  const write = (image: Buffer) => new Promise<void>((resolve, reject) => {
    if (ended) return reject(died());
    const onClose = () => reject(died());
    proc.once("close", onClose);
    proc.stdin.write(image, (err) => {
      proc.off("close", onClose);
      if (err) reject(died()); else resolve();
    });
  });
  try {
    await feed(write);
    proc.stdin.end();
    const code = await closed;
    if (code !== 0) throw new Error(`ffmpeg failed (exit ${code}):\n${stderr.trim().split("\n").slice(-20).join("\n")}`);
  } catch (e) {
    proc.kill();
    await closed.catch(() => null);
    fs.rmSync(outPath, { force: true });
    throw e;
  }
}

async function spikeMain(): Promise<void> {
  const { spike } = await import("./compositions/spike.ts");
  const browser = await chromium.launch();
  try {
    for (const ratio of RATIOS) {
      const started = Date.now();
      const comp = spike(ratio);
      const out = path.join(OUT_DIR, "promo", `spike-${ratio}.mp4`);
      const page = await browser.newPage();
      await encodeFrames(out, ratio, async (write) => { await renderFrames(page, comp, ratio, (img) => write(img)); }, { durationMs: comp.durationMs });
      await page.close();
      console.log(`${path.basename(out)}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href && process.argv[2] === "spike") {
  spikeMain().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
