// The live-footage cut: the drawn opening and closing, and between them the real app,
// recorded live by `promo:footage` — the phone beside its line of copy, the office full frame
// with the line as a caption, the way the training video shows it.
import { chromium, type Browser } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OUT_DIR, TRAINING_ROOT } from "../src/env.ts";
import { beatsFor, type Beat } from "./beats.ts";
import { filmOf } from "./compositions/index.ts";
import { BRAND, CANVAS, INK, box, esc, layoutFor, type BeatProps } from "./compositions/layout.ts";
import { AUDIENCES, insurersWithTemplate, resolveCopy, type Audience } from "./copy.ts";
import { BODY_FONT, HEADLINE_FONT, fontFaceCss } from "./fonts.ts";
import { footageDir, type Footage } from "./footage.ts";
import { encodeFrames, renderFrames } from "./renderer.ts";
import { ffmpeg, type Recording } from "./screencast.ts";
import { SIZE } from "./timeline.ts";

const RATIO = "16x9" as const, { width: W, height: H } = SIZE[RATIO];
const JOIN = 0.45;  // seconds two neighbours share
const INNER = 0.3;  // the same, between two takes of one screen
const TEMPLATES_DIR = path.join(TRAINING_ROOT, "..", "web", "src", "lib", "formfill", "templates");

// A stretch of a recording, between two of its marks, played `speed` times faster.
type Take = { rec: Recording; from: string; to: string; speed: number; pad?: number };
const at = (rec: Recording, mark: string) => {
  const t = rec.marks[mark];
  if (t === undefined) throw new Error(`the recording has no "${mark}" mark — run promo:footage again`);
  return t;
};
const lengthOf = (t: Take) => (at(t.rec, t.to) + (t.pad ?? 0) - at(t.rec, t.from)) / t.speed;

// Joins clips with soft dissolves. Returns the filter and how long the result runs.
export function dissolve(labels: string[], seconds: number[], fade: number, out: string): { filter: string; seconds: number } {
  if (labels.length === 1) return { filter: `[${labels[0]}]null[${out}]`, seconds: seconds[0] };
  const parts: string[] = [];
  let prev = labels[0], total = seconds[0];
  for (let i = 1; i < labels.length; i++) {
    const name = i === labels.length - 1 ? out : `${out}x${i}`;
    parts.push(`[${prev}][${labels[i]}]xfade=transition=fade:duration=${fade}:offset=${(total - fade).toFixed(3)}[${name}]`);
    total += seconds[i] - fade;
    prev = name;
  }
  return { filter: parts.join(";"), seconds: total };
}

const takeInputs = (takes: Take[]) => takes.flatMap((t) => ["-ss", at(t.rec, t.from).toFixed(3), "-t", (lengthOf(t) * t.speed).toFixed(3), "-i", t.rec.file]);
const ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "-r", "30"];

const html = (body: string, background: string) => `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${background};color:${INK};font-family:"${BODY_FONT}",sans-serif}
.lb{font-family:"${HEADLINE_FONT}",serif;font-weight:700;line-height:1.16;margin:0;text-wrap:balance}
</style></head><body>${body}</body></html>`;

async function still(browser: Browser, file: string, doc: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try {
    await page.setContent(doc, { waitUntil: "load" });
    await page.evaluate("Promise.all([...document.fonts].map((f) => f.load())).then(() => document.fonts.ready)");
    await page.screenshot({ path: file, omitBackground: true });
  } finally {
    await page.close();
  }
}

// The phone's screen in the frame, and the plate drawn around it (the screen is a hole).
const SCREEN = { width: 520, height: 960 };
function phonePlate(line: string): { doc: string; x: number; y: number } {
  const l = layoutFor(RATIO), bezel = 16;
  const x = Math.round(l.visual.x + (l.visual.width - SCREEN.width) / 2), y = Math.round((H - SCREEN.height) / 2);
  const frame = { x: x - bezel, y: y - bezel, width: SCREEN.width + 2 * bezel, height: SCREEN.height + 2 * bezel };
  const doc = html(`
    <div style="${box(frame)}border:${bezel}px solid ${INK};border-radius:54px;box-shadow:0 0 0 3000px ${CANVAS}"></div>
    <div style="${box(l.copy)}display:flex;flex-direction:column;justify-content:center;text-align:right">
      <i style="display:block;width:96px;height:8px;border-radius:4px;background:${BRAND};margin-bottom:34px"></i>
      <p class="lb" style="font-size:${l.label}px">${esc(line)}</p>
    </div>`, "transparent");
  return { doc, x, y };
}

const captionDoc = (line: string) => html(`
  <div style="position:absolute;left:0;right:0;bottom:44px;display:flex;justify-content:center">
    <p class="lb" style="font-size:50px;color:#fff;background:rgba(24,36,56,.95);padding:20px 48px 24px;border-radius:24px;box-shadow:0 18px 50px rgba(24,36,56,.4)">${esc(line)}</p>
  </div>`, "transparent");

// The drawn beats (opening, closing) as a clip of their own.
async function drawn(browser: Browser, file: string, beats: Beat[], props: Omit<BeatProps, "durationMs">): Promise<number> {
  const comp = filmOf(beats, props), page = await browser.newPage();
  try {
    await encodeFrames(file, RATIO, async (write) => { await renderFrames(page, comp, RATIO, (image) => write(image)); }, { durationMs: comp.durationMs });
  } finally {
    await page.close();
  }
  return comp.durationMs / 1000;
}

export async function editLive(audience: Audience, outDir = OUT_DIR): Promise<{ file: string; seconds: number }> {
  const dir = footageDir(audience, outDir), manifest = path.join(dir, "footage.json");
  if (!fs.existsSync(manifest)) throw new Error(`no footage for ${audience} — run \`npm run promo:footage -- ${audience}\``);
  const f = JSON.parse(fs.readFileSync(manifest, "utf8")) as Footage;
  const work = path.join(dir, "edit");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const copy = resolveCopy(audience), w = (name: string) => path.join(work, name);
  const props = { audience, cut: "full" as const, ratio: RATIO, copy, captures: {} as BeatProps["captures"], insurers: insurersWithTemplate(TEMPLATES_DIR) };
  const beats = beatsFor("full"), pick = (...ids: string[]) => beats.filter((b) => ids.includes(b.id));

  const browser = await chromium.launch();
  const clips: { file: string; seconds: number }[] = [];
  try {
    clips.push({ file: w("opening.mp4"), seconds: await drawn(browser, w("opening.mp4"), pick("chase", "turn"), props) });

    // The client: three takes on the phone, beside the line.
    const plate = phonePlate(copy.client);
    await still(browser, w("plate.png"), plate.doc);
    const phone: Take[] = [
      { rec: f.phone, from: "questions", to: "questions-end", speed: 1.5, pad: 0.4 },
      { rec: f.phone, from: "docs", to: "docs-end", speed: 1.5 },
      { rec: f.phone, from: "send", to: "send-end", speed: 1.25 },
    ];
    const pj = dissolve(phone.map((_, i) => `p${i}`), phone.map(lengthOf), INNER, "ph");
    await ffmpeg([...takeInputs(phone), "-loop", "1", "-i", w("plate.png"), "-filter_complex", [
      ...phone.map((t, i) => `[${i}:v]setpts=(PTS-STARTPTS)/${t.speed},fps=30,scale=${SCREEN.width}:${SCREEN.height}:flags=lanczos,setsar=1[p${i}]`),
      pj.filter,
      `color=c=white:s=${W}x${H}:r=30[bg]`, `[bg][ph]overlay=${plate.x}:${plate.y}:shortest=1[b]`, `[b][${phone.length}:v]overlay=0:0:shortest=1[v]`,
    ].join(";"), "-map", "[v]", "-t", pj.seconds.toFixed(3), ...ENCODE, w("client.mp4")]);
    clips.push({ file: w("client.mp4"), seconds: pj.seconds });

    // The office, full frame, with the line as a caption.
    const office = async (name: string, line: string, takes: Take[]) => {
      await still(browser, w(`${name}.png`), captionDoc(line));
      const j = dissolve(takes.map((_, i) => `d${i}`), takes.map(lengthOf), INNER, "desk");
      await ffmpeg([...takeInputs(takes), "-loop", "1", "-i", w(`${name}.png`), "-filter_complex", [
        ...takes.map((t, i) => `[${i}:v]setpts=(PTS-STARTPTS)/${t.speed},fps=30,scale=${W}:${H}:flags=lanczos,setsar=1[d${i}]`),
        j.filter,
        `[${takes.length}:v]format=rgba,fade=t=in:st=0.5:d=0.45:alpha=1[cap]`, `[desk][cap]overlay=0:0:shortest=1[v]`,
      ].join(";"), "-map", "[v]", "-t", j.seconds.toFixed(3), ...ENCODE, w(`${name}.mp4`)]);
      clips.push({ file: w(`${name}.mp4`), seconds: j.seconds });
    };
    await office("case", copy.caseFile, [
      { rec: f.office, from: "arrived", to: "files", speed: 1.25, pad: 1.0 } /* ends on the click: the pictures load off camera */,
      { rec: f.office, from: "files-ready", to: "files-end", speed: 1 },
    ]);
    await office("form", copy.form, [
      { rec: f.form, from: "tab", to: "tab-end", speed: 1.25 },
      { rec: f.form, from: "pdf", to: "pdf-end", speed: 1.3 },
    ]);

    clips.push({ file: w("closing.mp4"), seconds: await drawn(browser, w("closing.mp4"), pick("outcome", "endCard"), props) });
  } finally {
    await browser.close();
  }

  const whole = dissolve(clips.map((_, i) => `c${i}`), clips.map((c) => c.seconds), JOIN, "j");
  const file = path.join(outDir, "promo", `${audience}-live-${RATIO}.mp4`);
  await ffmpeg([
    ...clips.flatMap((c) => ["-i", c.file]), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", [
      ...clips.map((_, i) => `[${i}:v]fps=30,format=yuv420p,setsar=1,settb=AVTB[c${i}]`), whole.filter,
      `[j]scale=${W}:${H}:out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
    ].join(";"),
    "-map", "[v]", "-map", `${clips.length}:a`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "32k", "-t", whole.seconds.toFixed(3), "-movflags", "+faststart", file,
  ]);
  fs.rmSync(work, { recursive: true, force: true });
  return { file, seconds: whole.seconds };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const asked = process.argv[2];
  if (asked && !AUDIENCES.includes(asked as Audience)) {
    console.error(`usage: npm run promo:edit -- [${AUDIENCES.join("|")}]`);
    process.exit(1);
  }
  (async () => {
    for (const audience of asked ? [asked as Audience] : AUDIENCES) {
      const r = await editLive(audience);
      console.log(`${path.basename(r.file)}  ${r.seconds.toFixed(1)}s  ${(fs.statSync(r.file).size / 1024 / 1024).toFixed(1)} MB`);
    }
  })().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
