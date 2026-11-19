// The live-footage cut: the drawn opening and closing, and between them the real app,
// recorded live by `promo:footage` — the phone beside its line of copy, the office with the
// line as a caption, the way the training video shows it.
import { chromium, type Browser } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OUT_DIR, TRAINING_ROOT } from "../src/env.ts";
import { beatsFor, type Beat, type Output } from "./beats.ts";
import { filmOf } from "./compositions/index.ts";
import { BRAND, CANVAS, INK, box, esc, layoutFor, type BeatProps } from "./compositions/layout.ts";
import { insurersWithTemplate, resolveCopy } from "./copy.ts";
import { BODY_FONT, HEADLINE_FONT, fontFaceCss } from "./fonts.ts";
import { footageDir, type Footage, type Shape } from "./footage.ts";
import { selectOutputs } from "./render.ts";
import { encodeFrames, renderFrames } from "./renderer.ts";
import { ffmpeg, type Recording } from "./screencast.ts";
import { SIZE, type Ratio } from "./timeline.ts";

const JOIN = 0.45;  // seconds two neighbours share
const INNER = 0.3;  // the same, between two takes of one screen
const MAX_BYTES = 16 * 1024 * 1024; // above this WhatsApp recompresses, or refuses, the file
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

type Box = { x: number; y: number; width: number; height: number };
// Where things sit in each output shape. `shape` is which office recording fits it; `pill`
// is the size of the caption drawn over the office (null: the line sits above it instead).
export type Plan = { W: number; H: number; shape: Shape; phone: Box; copy: Box; desk: Box; pill: number | null; type: number; centre: boolean };
export function planFor(ratio: Ratio): Plan {
  const { width: W, height: H } = SIZE[ratio];
  if (ratio === "16x9") {
    const l = layoutFor(ratio), w = 520, h = 960;
    return { W, H, shape: "wide", phone: { x: Math.round(l.visual.x + (l.visual.width - w) / 2), y: (H - h) / 2, width: w, height: h }, copy: l.copy,
      desk: { x: 0, y: 0, width: W, height: H }, pill: 50, type: l.label, centre: false };
  }
  if (ratio === "1x1") {
    const l = layoutFor(ratio, "tall"), w = 500, h = 924;
    return { W, H, shape: "square", phone: { x: Math.round(l.visual.x + (l.visual.width - w) / 2), y: (H - h) / 2, width: w, height: h }, copy: l.copy,
      desk: { x: 0, y: 0, width: W, height: H }, pill: 42, type: 50, centre: false };
  }
  // Vertical: the line sits in the safe area at the top, the screen runs on below it.
  return { W, H, shape: "tall", phone: { x: (W - 600) / 2, y: 606, width: 600, height: 1108 }, copy: { x: 54, y: 270, width: W - 108, height: 290 },
    desk: { x: 0, y: 570, width: W, height: 1350 }, pill: null, type: 78, centre: true };
}

const html = (p: Plan, body: string) => `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{box-sizing:border-box}
html,body{margin:0;width:${p.W}px;height:${p.H}px;overflow:hidden;background:transparent;color:${INK};font-family:"${BODY_FONT}",sans-serif}
.lb{font-family:"${HEADLINE_FONT}",serif;font-weight:700;line-height:1.16;margin:0;text-wrap:balance}
</style></head><body>${body}</body></html>`;

async function still(browser: Browser, p: Plan, file: string, doc: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: p.W, height: p.H } });
  try {
    await page.setContent(doc, { waitUntil: "load" });
    await page.evaluate("Promise.all([...document.fonts].map((f) => f.load())).then(() => document.fonts.ready)");
    await page.screenshot({ path: file, omitBackground: true });
  } finally {
    await page.close();
  }
}

// The line of copy beside (or above) a screen.
const lineBlock = (p: Plan, line: string) => `
  <div style="${box(p.copy)}display:flex;flex-direction:column;justify-content:center;${p.centre ? "align-items:center;text-align:center" : "text-align:right"}">
    <i style="display:block;width:96px;height:8px;border-radius:4px;background:${BRAND};margin-bottom:${Math.round(p.type * 0.42)}px"></i>
    <p class="lb" style="font-size:${p.type}px">${esc(line)}</p>
  </div>`;

// Drawn around the phone's screen; the screen itself is a hole the recording shows through.
function phonePlate(p: Plan, line: string): string {
  const bezel = 16, s = p.phone;
  const frame = { x: s.x - bezel, y: s.y - bezel, width: s.width + 2 * bezel, height: s.height + 2 * bezel };
  return html(p, `<div style="${box(frame)}border:${bezel}px solid ${INK};border-radius:54px;box-shadow:0 0 0 3000px ${CANVAS}"></div>${lineBlock(p, line)}`);
}

// Over the office: a caption on the picture, or (vertical) the line above it.
const deskCaption = (p: Plan, line: string) => p.pill === null ? html(p, lineBlock(p, line)) : html(p, `
  <div style="position:absolute;left:0;right:0;bottom:${Math.round(p.H * 0.04)}px;display:flex;justify-content:center">
    <p class="lb" style="font-size:${p.pill}px;color:#fff;background:rgba(24,36,56,.95);padding:.4em .95em .48em;border-radius:.5em;box-shadow:0 18px 50px rgba(24,36,56,.4);max-width:92%">${esc(line)}</p>
  </div>`);

// The drawn beats (opening, closing) as a clip of their own.
async function drawn(browser: Browser, ratio: Ratio, file: string, beats: Beat[], props: Omit<BeatProps, "durationMs">): Promise<number> {
  const comp = filmOf(beats, props), page = await browser.newPage();
  try {
    await encodeFrames(file, ratio, async (write) => { await renderFrames(page, comp, ratio, (image) => write(image)); }, { durationMs: comp.durationMs });
  } finally {
    await page.close();
  }
  return comp.durationMs / 1000;
}

export async function editLive(browser: Browser, o: Output, outDir = OUT_DIR): Promise<{ file: string; seconds: number; bytes: number }> {
  const { audience, ratio, cut } = o;
  const dir = footageDir(audience, outDir), manifest = path.join(dir, "footage.json");
  if (!fs.existsSync(manifest)) throw new Error(`no footage for ${audience} — run "npm run promo:footage -- ${audience}"`);
  const f = JSON.parse(fs.readFileSync(manifest, "utf8")) as Footage;
  const p = planFor(ratio), desk = f.desk?.[p.shape];
  if (!desk) throw new Error(`the footage for ${audience} has no "${p.shape}" office recording — run promo:footage again`);
  const work = path.join(dir, `edit-${ratio}-${cut}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const copy = resolveCopy(audience), w = (name: string) => path.join(work, name);
  const props = { audience, cut, ratio, copy, captures: {} as BeatProps["captures"], insurers: insurersWithTemplate(TEMPLATES_DIR) };
  const beats = beatsFor(cut), pick = (...ids: string[]) => beats.filter((b) => ids.includes(b.id));
  const short = cut === "short", pill = p.pill !== null;
  const clips: { file: string; seconds: number }[] = [];

  // A screen recording placed in the frame, with a drawn layer over it.
  const screen = async (name: string, takes: Take[], where: Box, overDoc: string, fadeOver: boolean) => {
    await still(browser, p, w(`${name}.png`), overDoc);
    const j = dissolve(takes.map((_, i) => `t${i}`), takes.map(lengthOf), INNER, "shot");
    await ffmpeg([...takeInputs(takes), "-loop", "1", "-i", w(`${name}.png`), "-filter_complex", [
      ...takes.map((t, i) => `[${i}:v]setpts=(PTS-STARTPTS)/${t.speed},fps=30,scale=${where.width}:${where.height}:flags=lanczos,setsar=1[t${i}]`),
      j.filter, `color=c=${CANVAS}:s=${p.W}x${p.H}:r=30[bg]`, `[bg][shot]overlay=${where.x}:${where.y}:shortest=1[b]`,
      `[${takes.length}:v]format=rgba${fadeOver ? ",fade=t=in:st=0.4:d=0.4:alpha=1" : ""}[over]`, "[b][over]overlay=0:0:shortest=1[v]",
    ].join(";"), "-map", "[v]", "-t", j.seconds.toFixed(3), ...ENCODE, w(`${name}.mp4`)]);
    clips.push({ file: w(`${name}.mp4`), seconds: j.seconds });
  };

  try {
    clips.push({ file: w("opening.mp4"), seconds: await drawn(browser, ratio, w("opening.mp4"), short ? pick("chase") : pick("chase", "turn"), props) });
    await screen("client", short
      ? [{ rec: f.phone, from: "docs", to: "docs-end", speed: 3 }]
      : [
        { rec: f.phone, from: "questions", to: "questions-end", speed: 1.5, pad: 0.4 },
        { rec: f.phone, from: "docs", to: "docs-end", speed: 1.5 },
        { rec: f.phone, from: "send", to: "send-end", speed: 1.25 },
      ], p.phone, phonePlate(p, copy.client), false);
    await screen("case", short
      ? [{ rec: desk.office, from: "files-ready", to: "files-end", speed: 1.5 }]
      : [
        { rec: desk.office, from: "arrived", to: "files", speed: 1.25, pad: 1.0 }, // ends on the click: the pictures load off camera
        { rec: desk.office, from: "files-ready", to: "files-end", speed: 1 },
      ], p.desk, deskCaption(p, copy.caseFile), pill);
    await screen("form", short
      ? [{ rec: desk.form, from: "pdf", to: "pdf-end", speed: 3 }]
      : [
        { rec: desk.form, from: "tab", to: "tab-end", speed: 1.25 },
        { rec: desk.form, from: "pdf", to: "pdf-end", speed: 1.3 },
      ], p.desk, deskCaption(p, copy.form), pill);
    clips.push({ file: w("closing.mp4"), seconds: await drawn(browser, ratio, w("closing.mp4"), short ? pick("endCard") : pick("outcome", "endCard"), props) });

    const whole = dissolve(clips.map((_, i) => `c${i}`), clips.map((c) => c.seconds), short ? 0.35 : JOIN, "j");
    const file = path.join(outDir, "promo", o.file), partial = path.join(outDir, "promo", `.partial-${o.file}`);
    fs.rmSync(file, { force: true });
    try {
      await ffmpeg([
        ...clips.flatMap((c) => ["-i", c.file]), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-filter_complex", [
          ...clips.map((_, i) => `[${i}:v]fps=30,format=yuv420p,setsar=1,settb=AVTB[c${i}]`), whole.filter,
          `[j]scale=${p.W}:${p.H}:out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
        ].join(";"),
        "-map", "[v]", "-map", `${clips.length}:a`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", "32k", "-t", whole.seconds.toFixed(3), "-movflags", "+faststart", "-f", "mp4", partial,
      ]);
      const bytes = fs.statSync(partial).size;
      if (bytes > MAX_BYTES) throw new Error(`${o.file} is over 16 MB (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
      fs.renameSync(partial, file); // only a finished, checked file gets the real name
      return { file, seconds: whole.seconds, bytes };
    } finally {
      fs.rmSync(partial, { force: true });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  (async () => {
    const outputs = selectOutputs(process.argv.slice(2)); // --audience / --ratio / --cut
    const browser = await chromium.launch();
    try {
      for (const o of outputs) {
        const r = await editLive(browser, o);
        console.log(`${o.file.padEnd(22)} ${r.seconds.toFixed(1)}s  ${(r.bytes / 1024 / 1024).toFixed(1)} MB`);
      }
    } finally {
      await browser.close();
    }
  })().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
