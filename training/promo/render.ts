// Stage 2 of the promo: turn the captures and the compositions into mp4 files.
// Needs no app and no database — only `out/promo/captures/` from `npm run promo:capture`.
import { config } from "dotenv";
import { chromium, type Browser } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OUT_DIR, TRAINING_ROOT } from "../src/env.ts";
import { OUTPUTS, totalMs, type Output } from "./beats.ts";
import { insurersWithTemplate, resolveCopy } from "./copy.ts";
import { film } from "./compositions/index.ts";
import type { CaptureRef } from "./compositions/layout.ts";
import { captureDir, readManifest, type CaptureId } from "./manifest.ts";
import { encodeFrames, renderFrames } from "./renderer.ts";

const MAX_BYTES = 16 * 1024 * 1024; // above this WhatsApp recompresses, or refuses, the file
const TEMPLATES_DIR = path.join(TRAINING_ROOT, "..", "web", "src", "lib", "formfill", "templates");

const FLAGS = { "--audience": "audience", "--ratio": "ratio", "--cut": "cut" } as const;

export function selectOutputs(args: string[]): Output[] {
  let picked = OUTPUTS;
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] as keyof typeof FLAGS, value = args[i + 1];
    const key = FLAGS[flag];
    if (!key) throw new Error(`unknown flag ${args[i]} (use ${Object.keys(FLAGS).join(", ")})`);
    const allowed = [...new Set(OUTPUTS.map((o) => o[key] as string))];
    if (!value || !allowed.includes(value)) throw new Error(`${flag} must be one of: ${allowed.join(", ")}`);
    picked = picked.filter((o) => o[key] === value);
  }
  return picked;
}

function loadCaptures(o: Output, outDir: string): Record<CaptureId, CaptureRef> {
  const manifest = readManifest(o.audience, outDir); // refuses the other audience's captures and incomplete sets
  const dir = captureDir(o.audience, outDir);
  return Object.fromEntries(manifest.captures.map((c) => [
    c.id,
    { src: `data:image/png;base64,${fs.readFileSync(path.join(dir, c.file)).toString("base64")}`, width: c.width, height: c.height, cssWidth: c.cssWidth, marks: c.marks, avoid: c.avoid },
  ])) as Record<CaptureId, CaptureRef>;
}

export type RenderOpts = { outDir?: string; music?: string };

export async function renderOutput(browser: Browser, o: Output, opts: RenderOpts = {}): Promise<{ file: string; bytes: number; frames: number }> {
  const outDir = opts.outDir ?? OUT_DIR;
  if (opts.music && !fs.existsSync(opts.music)) throw new Error(`PROMO_MUSIC points at a file that does not exist: ${opts.music}`);
  const captures = loadCaptures(o, outDir);
  const insurers = insurersWithTemplate(TEMPLATES_DIR);
  const copy = resolveCopy(o.audience);
  const file = path.join(outDir, "promo", o.file);
  const partial = path.join(outDir, "promo", `.partial-${o.file}`);
  fs.rmSync(file, { force: true });

  const page = await browser.newPage();
  let frames = 0;
  try {
    await encodeFrames(partial, o.ratio, async (write) => {
      // One document for the whole cut, so a beat can leave while the next arrives.
      const whole = film({ audience: o.audience, cut: o.cut, ratio: o.ratio, copy, captures, insurers });
      frames += await renderFrames(page, whole, o.ratio, (image) => write(image));
    }, { durationMs: totalMs(o.cut), music: opts.music });
    const bytes = fs.statSync(partial).size;
    if (bytes > MAX_BYTES) throw new Error(`${o.file} is over 16 MB (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    fs.renameSync(partial, file); // only a finished, checked file gets the real name
    return { file, bytes, frames };
  } finally {
    fs.rmSync(partial, { force: true });
    await page.close();
  }
}

async function main(): Promise<void> {
  config({ path: path.join(TRAINING_ROOT, ".env.local"), quiet: true });
  const music = process.env.PROMO_MUSIC?.trim() || undefined;
  const outputs = selectOutputs(process.argv.slice(2));
  for (const o of outputs) fs.rmSync(path.join(OUT_DIR, "promo", o.file), { force: true }); // a failed run leaves no stale file
  const browser = await chromium.launch();
  try {
    for (const o of outputs) {
      const started = Date.now();
      const r = await renderOutput(browser, o, { music });
      console.log(`${o.file.padEnd(22)} ${(totalMs(o.cut) / 1000).toFixed(1)}s  ${(r.bytes / 1024 / 1024).toFixed(1)} MB  (rendered in ${Math.round((Date.now() - started) / 1000)}s)`);
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
