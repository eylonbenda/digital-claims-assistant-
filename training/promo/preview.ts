// Design aid: one still per beat, without rendering a whole video.
//   npm run promo:preview -- garage 9x16 [full|short] [0.7]
// writes out/promo/preview/<audience>-<ratio>-<n>-<beat>.png at that fraction of each beat.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, TRAINING_ROOT } from "../src/env.ts";
import { beatsFor, type Cut } from "./beats.ts";
import { AUDIENCES, insurersWithTemplate, resolveCopy, type Audience } from "./copy.ts";
import { compose } from "./compositions/index.ts";
import type { CaptureRef } from "./compositions/layout.ts";
import { captureDir, readManifest, type CaptureId } from "./manifest.ts";
import { frameAt, prepare } from "./renderer.ts";
import { RATIOS, type Ratio } from "./timeline.ts";

const [audience = "garage", ratio = "9x16", cut = "full", fraction = "0.7"] = process.argv.slice(2) as [Audience, Ratio, Cut, string];
if (!AUDIENCES.includes(audience) || !RATIOS.includes(ratio) || !["full", "short"].includes(cut)) {
  console.error("usage: npm run promo:preview -- <garage|agent> <9x16|1x1|16x9> [full|short] [fraction]");
  process.exit(1);
}

const manifest = readManifest(audience);
const dir = captureDir(audience);
const captures = Object.fromEntries(manifest.captures.map((c) => [
  c.id, { src: `data:image/png;base64,${fs.readFileSync(path.join(dir, c.file)).toString("base64")}`, width: c.width, height: c.height, points: c.points },
])) as unknown as Record<CaptureId, CaptureRef>;
const insurers = insurersWithTemplate(path.join(TRAINING_ROOT, "..", "web", "src", "lib", "formfill", "templates"));

const out = path.join(OUT_DIR, "promo", "preview");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
let n = 0;
for (const beat of beatsFor(cut)) {
  const comp = compose(beat.id, { audience, cut, ratio, durationMs: beat.durationMs, copy: resolveCopy(audience), captures, insurers });
  await prepare(page, comp, ratio);
  const file = path.join(out, `${audience}-${ratio}-${cut}-${n++}-${beat.id}.jpg`);
  fs.writeFileSync(file, await frameAt(page, comp.durationMs * Number(fraction)));
  console.log(file);
}
await browser.close();
