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
  return [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")))];
})()`;

const seek = (ms: number) => `(() => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${ms}; }
})()`;

// Loads a composition at the output size and freezes it at t=0.
export async function prepare(page: Page, comp: Composition, ratio: Ratio): Promise<void> {
  await page.setViewportSize(SIZE[ratio]);
  await page.setContent(comp.html, { waitUntil: "load" });
  const loaded = (await page.evaluate(LOAD_FONTS)) as string[];
  for (const family of REQUIRED_FAMILIES) {
    if (!loaded.includes(family)) throw new Error(`font not loaded: ${family}`);
  }
  await page.evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => null)))`);
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
    const fade = 1.5;
    args.push("-i", opts.music, "-af", `afade=t=out:st=${Math.max(0, seconds - fade).toFixed(3)}:d=${fade},apad`);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"); // some players dislike video-only files
  }
  args.push(
    "-map", "0:v", "-map", "1:a",
    "-vf", `scale=${width}:${height},format=yuv420p`,
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
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
  const write = (image: Buffer) => new Promise<void>((resolve, reject) => {
    if (proc.exitCode !== null) return reject(new Error(`ffmpeg exited early:\n${stderr.trim()}`));
    if (proc.stdin.write(image)) resolve(); else proc.stdin.once("drain", resolve);
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
