// The three product moments. Every picture here is a capture of the real app on demo data.
import type { Composition } from "../renderer.ts";
import type { CaptureId } from "../manifest.ts";
import { browserFrame, cropLayer, mapPoint, phoneFrame, tap, type Crop, type Frame } from "./device.ts";
import { CANVAS, Sheet, copyBlock, esc, layoutFor, page, type BeatProps, type CaptureRef, type Layout, type VisualKind } from "./layout.ts";

// A capture on screen for part of a scene. `at` and `tap.at` are fractions of the scene.
// `wide` is the crop for a landscape window, `tall` for the vertical video's upright one.
type CropOf = Crop | ((cap: CaptureRef) => Crop);
type Shot = { id: CaptureId; wide: CropOf; tall?: CropOf; at: number; tap?: { point: string; at: number } };
type Scene = { kind: VisualKind; build: (s: Sheet, l: Layout, p: BeatProps, t0: number, dur: number, brief: boolean) => string };

const WHOLE: Crop = { cx: 0.5, cy: 0.5, w: 1 };

// The crops keep the app's side menu and greeting out of frame: they show the demo login's
// address, and in the garage version nothing on screen should read "סוכן".
const QUESTION: Shot = { id: "client-question", wide: WHOLE, at: 0, tap: { point: "answer", at: 0.13 } };
const LICENCE: Shot = { id: "client-licence", wide: WHOLE, at: 0.23 };
const PHOTOS: Shot = { id: "client-photos", wide: WHOLE, at: 0.49, tap: { point: "next", at: 0.67 } };
const SENT: Shot = { id: "client-sent", wide: WHOLE, at: 0.75 };

const DASHBOARD: Shot = { id: "dashboard-submitted", wide: { cx: 0.54, cy: 0.5, w: 0.52 }, tall: { cx: 0.62, cy: 0.54, w: 0.36 }, at: 0, tap: { point: "claim", at: 0.2 } };
const OVERVIEW: Shot = { id: "cockpit-overview", wide: { cx: 0.405, cy: 0.56, w: 0.79 }, tall: { cx: 0.55, cy: 0.5, w: 0.5 }, at: 0.32 };
const FILES: Shot = { id: "cockpit-files", wide: { cx: 0.6, cy: 0.42, w: 0.4 }, tall: { cx: 0.64, cy: 0.45, w: 0.32 }, at: 0.67 };
// Centred on the "fill the form" button wherever the page put it.
const formCrop = (w: number, lift: number): CropOf => (cap) => {
  const b = cap.points?.generate ?? { x: 0.48, y: 0.64 };
  return { cx: Math.min(Math.max(b.x, 0.3), 0.55), cy: b.y - lift, w };
};
const FORM_TAB: Shot = { id: "form-tab", wide: formCrop(0.56, 0.06), tall: formCrop(0.4, 0.1), at: 0, tap: { point: "generate", at: 0.19 } };
// Starts below the form's printed heading, on the fields the system filled.
const PDF_WIDE: Crop = { cx: 0.5, cy: 0.37, w: 1 };
const PDF_TALL: Crop = { cx: 0.69, cy: 0.37, w: 0.62 };

const at = (shot: Shot, time: number, tapAt?: number): Shot => ({ ...shot, at: time, tap: shot.tap && tapAt !== undefined ? { ...shot.tap, at: tapAt } : undefined });

function shots(s: Sheet, l: Layout, p: BeatProps, frame: Frame, list: Shot[], t0: number, dur: number): string {
  const tall = l.windowAspect < 1;
  const size = Math.round(frame.rect.width * (frame.aspect < 0.7 ? 0.15 : 0.075));
  return list.map((shot, i) => {
    const cap = p.captures[shot.id];
    const pick = (tall && shot.tall) || shot.wide;
    const crop = typeof pick === "function" ? pick(cap) : pick;
    const start = t0 + shot.at * dur, end = t0 + (list[i + 1]?.at ?? 1) * dur;
    // A slow push-in keeps a still alive while it is on screen. The tap rides inside it,
    // so it stays on its control.
    const push = s.anim("from{transform:scale(1)}to{transform:scale(1.045)}", start, end - start + 300, "linear");
    let ripple = "";
    const point = shot.tap && cap.points?.[shot.tap.point];
    if (shot.tap && point) {
      const m = mapPoint(cap, crop, frame.aspect, point.x, point.y);
      if (m.fx > 0.04 && m.fx < 0.96 && m.fy > 0.04 && m.fy < 0.96) ripple = tap(s, m.fx, m.fy, t0 + shot.tap.at * dur, size);
    }
    return `<div style="position:absolute;inset:0;transform-origin:50% 40%;${i === 0 ? "" : s.fadeIn(start, 280)}${""}">
      <div style="position:absolute;inset:0;transform-origin:50% 40%;${push}">${cropLayer(cap, crop, frame.aspect)}${ripple}</div></div>`;
  }).join("");
}

const label = (s: Sheet, l: Layout, key: string, text: string, t0: number) =>
  `<p class="lb" data-copy="${key}" style="font-size:${l.label}px;${s.rise(t0 + 120, 40, 560)}">${esc(text)}</p>`;

const clientScene: Scene = {
  kind: "tall",
  build: (s, l, p, t0, dur, brief) => {
    const f = phoneFrame(l.visual, s.rise(t0, 70, 620));
    const list = brief ? [at(PHOTOS, 0, 0.36), at(SENT, 0.52)] : [QUESTION, LICENCE, PHOTOS, SENT];
    return copyBlock(l, label(s, l, "client", p.copy.client, t0)) + f.open + shots(s, l, p, f, list, t0, dur) + f.close;
  },
};

const caseScene: Scene = {
  kind: "wide",
  build: (s, l, p, t0, dur, brief) => {
    const f = browserFrame(l.visual, l.windowAspect, s.rise(t0, 70, 620));
    const list = brief ? [at(OVERVIEW, 0), at(FILES, 0.5)] : [DASHBOARD, OVERVIEW, FILES];
    return copyBlock(l, label(s, l, "caseFile", p.copy.caseFile, t0)) + f.open + shots(s, l, p, f, list, t0, dur) + f.close;
  },
};

const formScene: Scene = {
  kind: "wide",
  build: (s, l, p, t0, dur, brief) => {
    const f = browserFrame(l.visual, l.windowAspect, s.rise(t0, 70, 620));
    const pdfAt = brief ? 0 : 0.34;
    const pdfStart = t0 + pdfAt * dur;
    // The filled form slides up over the app like a sheet of paper, then drifts so the eye
    // travels down the filled fields.
    const paper = `<div style="position:absolute;inset:0;background:#fff;${brief ? "" : s.anim("from{transform:translateY(102%)}to{transform:none}", pdfStart, 620)}">
      <div style="position:absolute;inset:0;transform-origin:85% 0%;${s.anim("from{transform:scale(1.02)}to{transform:scale(1.2) translateY(-5%)}", pdfStart + 200, t0 + dur - pdfStart, "linear")}">
        ${cropLayer(p.captures["pdf-page-1"], l.windowAspect < 1 ? PDF_TALL : PDF_WIDE, f.aspect)}
      </div></div>`;
    const insurers = !brief && p.insurers.length
      ? `<p class="sm" data-copy="insurers" style="font-size:${l.small}px;color:#5b667a;${s.rise(pdfStart + 500, 24, 520)}">${esc(p.copy.insurersLead)}: ${p.insurers.map(esc).join(" · ")}</p>`
      : "";
    return copyBlock(l, label(s, l, "form", p.copy.form, t0) + insurers) + f.open + (brief ? "" : shots(s, l, p, f, [FORM_TAB], t0, dur * pdfAt)) + paper + f.close;
  },
};

function beat(p: BeatProps, parts: { scene: Scene; share: number }[], brief: boolean): Composition {
  const s = new Sheet(), T = p.durationMs;
  let t0 = 0;
  const body = parts.map(({ scene, share }) => {
    const dur = T * share;
    const l = layoutFor(p.ratio, scene.kind);
    const html = `<div style="position:absolute;inset:0;${parts.length > 1 ? s.window(t0, t0 + dur, T, 220) : ""}">${scene.build(s, l, p, t0, dur, brief)}</div>`;
    t0 += dur;
    return html;
  }).join("");
  return { html: page(layoutFor(p.ratio), CANVAS, s, body), durationMs: T };
}

export const client = (p: BeatProps) => beat(p, [{ scene: clientScene, share: 1 }], false);
export const caseFile = (p: BeatProps) => beat(p, [{ scene: caseScene, share: 1 }], false);
export const form = (p: BeatProps) => beat(p, [{ scene: formScene, share: 1 }], false);
// The 15-second cut: the same three moments, one breath each.
export const montage = (p: BeatProps) => beat(p, [
  { scene: clientScene, share: 0.33 }, { scene: caseScene, share: 0.33 }, { scene: formScene, share: 0.34 },
], true);
