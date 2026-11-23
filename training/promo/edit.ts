// The live-footage cut: the drawn opening and closing, and between them the real app,
// recorded live by `promo:footage` — the phone beside its line of copy, the office with the
// line as a caption, the way the training video shows it.
import { config } from "dotenv";
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
import { cues, gainFor, loadVoice, loudnessOf, roomFor, soundtrack, stretch, type Part, type VoiceId } from "./narration.ts";
import { selectOutputs } from "./render.ts";
import { encodeFrames, renderFrames } from "./renderer.ts";
import { ffmpeg, type Recording } from "./screencast.ts";
import { SUBTITLE, chunks, subtitleFilter, timed, type Subtitle } from "./subtitles.ts";
import { scriptLines } from "./voice.ts";
import { SIZE, type Ratio } from "./timeline.ts";

const JOIN = 0.45;  // seconds two neighbours share
const INNER = 0.3;  // the same, between two takes of one screen
const SLOWEST = 0.8; // footage slowed past this looks wrong; beyond it the last picture is held
const NARRATED_PACE = 1.35; // a narrated film moves this much faster: the voice says what the screen shows
const MAX_BYTES = 16 * 1024 * 1024; // above this WhatsApp recompresses, or refuses, the file
const TEMPLATES_DIR = path.join(TRAINING_ROOT, "..", "web", "src", "lib", "formfill", "templates");

// A stretch of a recording, between two of its marks, played `speed` times faster, its
// last picture then held for `hold` seconds.
export type Take = { rec: Recording; from: string; to: string; speed: number; pad?: number; hold?: number };
const at = (rec: Recording, mark: string) => {
  const t = rec.marks[mark];
  if (t === undefined) throw new Error(`the recording has no "${mark}" mark — run promo:footage again`);
  return t;
};
const span = (t: Take) => at(t.rec, t.to) + (t.pad ?? 0) - at(t.rec, t.from); // seconds of recording
const lengthOf = (t: Take) => span(t) / t.speed + (t.hold ?? 0);
const screenSeconds = (takes: Take[]) => takes.reduce((s, t) => s + lengthOf(t), 0) - INNER * (takes.length - 1);

// Makes a screen run at least `need` seconds (the room its narration line takes): every
// take is slowed by the same share, and what slowing cannot give is a hold at the end.
export function fit(takes: Take[], need: number): Take[] {
  const joins = INNER * (takes.length - 1), have = screenSeconds(takes);
  if (have >= need) return takes;
  const k = (need + joins) / (have + joins);
  const slowed = takes.map((t) => ({ ...t, speed: Math.max(t.speed / k, Math.min(t.speed, SLOWEST)) }));
  const short = need - screenSeconds(slowed);
  if (short > 1e-6) slowed[slowed.length - 1].hold = (slowed[slowed.length - 1].hold ?? 0) + short;
  return slowed;
}

// The same takes, played `k` times faster.
export const pace = (takes: Take[], k: number): Take[] => (k === 1 ? takes : takes.map((t) => ({ ...t, speed: t.speed * k })));

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

const takeInputs = (takes: Take[]) => takes.flatMap((t) => ["-ss", at(t.rec, t.from).toFixed(3), "-t", span(t).toFixed(3), "-i", t.rec.file]);
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

// `voiceDir` holds one sound file per narration line (see narration.ts); with none the
// film is silent. `music` is a track mixed under it. Only the full cut is narrated. A
// narrated film carries the narration as subtitles unless `subtitles` is false.
export type EditOpts = { voiceDir?: string; music?: string; subtitles?: boolean };

// One phrase of the narration, on a dark plate low in the frame.
const subtitleDoc = (p: Plan, ratio: Ratio, text: string) => html(p, `
  <div style="position:absolute;left:5%;right:5%;bottom:${Math.round(p.H * SUBTITLE[ratio].bottom)}px;display:flex;justify-content:center">
    <p style="margin:0;font-weight:600;font-size:${SUBTITLE[ratio].size}px;line-height:1.3;color:#fff;background:rgba(16,24,40,.86);padding:.28em .7em .34em;border-radius:.32em;text-align:center;white-space:nowrap">${esc(text)}</p>
  </div>`);
export const voiceDirFor = (audience: string) => path.join(TRAINING_ROOT, "fixtures", "promo", "voice", audience);

export async function editLive(browser: Browser, o: Output, outDir = OUT_DIR, opts: EditOpts = {}): Promise<{ file: string; seconds: number; bytes: number; narrated: boolean }> {
  if (opts.music && !fs.existsSync(opts.music)) throw new Error(`PROMO_MUSIC points at a file that does not exist: ${opts.music}`);
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
  const beats = beatsFor(cut);
  const short = cut === "short", pill = p.pill !== null;
  const voice = short ? null : await loadVoice(opts.voiceDir ?? voiceDirFor(audience));
  const said = (id: VoiceId) => voice?.[id].seconds ?? 0;
  const subtitled = !!voice && opts.subtitles !== false;
  // With subtitles the caption over the office would say the same thing twice, in the same place.
  const officeLine = (line: string) => (subtitled && pill ? html(p, "") : deskCaption(p, line));
  const clips: { file: string; seconds: number; parts: Part[] }[] = [];

  // A screen recording placed in the frame, with a drawn layer over it.
  const screen = async (id: VoiceId, name: string, raw: Take[], where: Box, overDoc: string, fadeOver: boolean) => {
    const takes = voice ? fit(pace(raw, NARRATED_PACE), roomFor(said(id))) : raw;
    await still(browser, p, w(`${name}.png`), overDoc);
    const j = dissolve(takes.map((_, i) => `t${i}`), takes.map(lengthOf), INNER, "shot");
    await ffmpeg([...takeInputs(takes), "-loop", "1", "-i", w(`${name}.png`), "-filter_complex", [
      ...takes.map((t, i) => `[${i}:v]setpts=(PTS-STARTPTS)/${t.speed},fps=30,scale=${where.width}:${where.height}:flags=lanczos,setsar=1${t.hold ? `,tpad=stop_mode=clone:stop_duration=${t.hold.toFixed(3)}` : ""}[t${i}]`),
      j.filter, `color=c=${CANVAS}:s=${p.W}x${p.H}:r=30[bg]`, `[bg][shot]overlay=${where.x}:${where.y}:shortest=1[b]`,
      `[${takes.length}:v]format=rgba${fadeOver ? ",fade=t=in:st=0.4:d=0.4:alpha=1" : ""}[over]`, "[b][over]overlay=0:0:shortest=1[v]",
    ].join(";"), "-map", "[v]", "-t", j.seconds.toFixed(3), ...ENCODE, w(`${name}.mp4`)]);
    clips.push({ file: w(`${name}.mp4`), seconds: j.seconds, parts: [{ id, seconds: j.seconds, voice: said(id) }] });
  };
  // Drawn beats as one clip, each beat long enough for its line.
  const drawnClip = async (name: string, ids: VoiceId[]) => {
    const fitted = stretch(beats.filter((b) => (ids as string[]).includes(b.id)), voice ? Object.fromEntries(ids.map((id) => [id, said(id)])) : {});
    const seconds = await drawn(browser, ratio, w(`${name}.mp4`), fitted, props);
    clips.push({ file: w(`${name}.mp4`), seconds, parts: fitted.map((b) => ({ id: b.id as VoiceId, seconds: b.durationMs / 1000, voice: said(b.id as VoiceId) })) });
  };

  try {
    await drawnClip("opening", short ? ["chase"] : ["chase", "turn"]);
    await screen("client", "client", short
      ? [{ rec: f.phone, from: "docs", to: "docs-end", speed: 3 }]
      : [
        { rec: f.phone, from: "questions", to: "questions-end", speed: 1.8, pad: 0.4 },
        { rec: f.phone, from: "docs", to: "docs-end", speed: 1.7 },
        { rec: f.phone, from: "send", to: "send-end", speed: 1.25 },
      ], p.phone, phonePlate(p, copy.client), false);
    await screen("caseFile", "case", short
      ? [{ rec: desk.office, from: "files-ready", to: "files-end", speed: 1.5 }]
      : [
        { rec: desk.office, from: "arrived", to: "files", speed: 1.25, pad: 1.0 }, // ends on the click: the pictures load off camera
        { rec: desk.office, from: "files-ready", to: "files-end", speed: 1 },
      ], p.desk, officeLine(copy.caseFile), pill);
    await screen("form", "form", short
      ? [{ rec: desk.form, from: "pdf", to: "pdf-end", speed: 3 }]
      : [
        { rec: desk.form, from: "tab", to: "tab-end", speed: 1.25 },
        { rec: desk.form, from: "pdf", to: "pdf-end", speed: 1.6 },
      ], p.desk, officeLine(copy.form), pill);
    // What happens after the form goes out. The short cut has no room for it.
    if (!short) {
      if (!desk.handling || !desk.chase) throw new Error(`the footage for ${audience} has no claim-handling recording — run promo:footage again`);
      await screen("work", "work", [
        { rec: desk.chase, from: "missing", to: "missing-end", speed: 1.2 },
        // The task list is filmed only where the garage cut can show it.
        ...(desk.handling.marks.tasks === undefined ? [] : [{ rec: desk.handling, from: "tasks", to: "tasks-end", speed: 1.2 }]),
        { rec: desk.handling, from: "send", to: "send-end", speed: 1.7 },
      ], p.desk, officeLine(copy.work), pill);
      await screen("handling", "handling", [{ rec: desk.handling, from: "status", to: "status-end", speed: 1.4 }], p.desk, officeLine(copy.handling), pill);
    }
    await drawnClip("closing", short ? ["endCard"] : ["outcome", "endCard"]);

    const join = short ? 0.35 : JOIN;
    const whole = dissolve(clips.map((_, i) => `c${i}`), clips.map((c) => c.seconds), join, "j");
    // The sound: the narrator's lines at their cues, music under them, or silence.
    const lines = voice ? cues(clips, join).map((c) => ({ ...c, gain: voice[c.id].gain })) : [], n = clips.length, sound = lines.length > 0 || !!opts.music;
    const audioIn = sound
      ? [...lines.flatMap((c) => ["-i", voice![c.id].file]), ...(opts.music ? ["-stream_loop", "-1", "-i", opts.music] : [])]
      : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]; // some players dislike video-only files
    const musicGain = opts.music ? gainFor(await loudnessOf(opts.music)) : 0; // voice and music are both levelled first
    const audioFilter = sound ? [soundtrack(lines, n, { music: opts.music ? { input: n + lines.length, seconds: whole.seconds, gain: musicGain } : undefined })] : [];
    // The subtitles: each line's words, a phrase at a time, while the line is spoken.
    const script = subtitled ? scriptLines(fs.readFileSync(path.join(TRAINING_ROOT, "promo", "narration.md"), "utf8"), audience) : null;
    const subs: Subtitle[] = script ? lines.flatMap((c) => timed(chunks(script[c.id], SUBTITLE[ratio].max), c.at, voice![c.id].seconds)) : [];
    for (const [i, sub] of subs.entries()) await still(browser, p, w(`sub${i}.png`), subtitleDoc(p, ratio, sub.text));
    const subIn = subs.flatMap((_, i) => ["-i", w(`sub${i}.png`)]), firstSub = n + (sound ? lines.length + (opts.music ? 1 : 0) : 1);
    const file = path.join(outDir, "promo", o.file), partial = path.join(outDir, "promo", `.partial-${o.file}`);
    fs.rmSync(file, { force: true });
    try {
      await ffmpeg([
        ...clips.flatMap((c) => ["-i", c.file]), ...audioIn, ...subIn,
        "-filter_complex", [
          ...clips.map((_, i) => `[${i}:v]fps=30,format=yuv420p,setsar=1,settb=AVTB[c${i}]`), whole.filter,
          `[j]scale=${p.W}:${p.H}:out_color_matrix=bt709:out_range=tv,format=yuv420p[film]`, subtitleFilter(subs, firstSub, "film", "v"), ...audioFilter,
        ].join(";"),
        "-map", "[v]", "-map", sound ? "[a]" : `${n}:a`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", sound ? "128k" : "32k", "-t", whole.seconds.toFixed(3), "-movflags", "+faststart", "-f", "mp4", partial,
      ]);
      const bytes = fs.statSync(partial).size;
      if (bytes > MAX_BYTES) throw new Error(`${o.file} is over 16 MB (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
      fs.renameSync(partial, file); // only a finished, checked file gets the real name
      return { file, seconds: whole.seconds, bytes, narrated: lines.length > 0 };
    } finally {
      fs.rmSync(partial, { force: true });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  (async () => {
    config({ path: path.join(TRAINING_ROOT, ".env.local"), quiet: true });
    const music = process.env.PROMO_MUSIC?.trim() || undefined;
    const args = process.argv.slice(2), subtitles = !args.includes("--no-subtitles");
    const outputs = selectOutputs(args.filter((a) => a !== "--no-subtitles")); // --audience / --ratio / --cut
    const browser = await chromium.launch();
    try {
      for (const o of outputs) {
        const r = await editLive(browser, o, OUT_DIR, { music, subtitles });
        console.log(`${o.file.padEnd(22)} ${r.seconds.toFixed(1)}s  ${(r.bytes / 1024 / 1024).toFixed(1)} MB  ${r.narrated ? "narrated" : music ? "music only" : "silent"}`);
      }
    } finally {
      await browser.close();
    }
  })().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
