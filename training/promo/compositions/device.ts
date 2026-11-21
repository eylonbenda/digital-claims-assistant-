import { BRAND, INK, box, type CaptureRef, type Rect, type Sheet, fit } from "./layout.ts";

export type Region = { x: number; y: number; w: number; h: number };
export type Mark = Region & { px: number };
export type View = { width: number; height: number };

// A named part of a capture; a capture without it cannot be filmed.
export function markOf(cap: CaptureRef, id: string, name: string): Mark {
  const m = cap.marks?.[name];
  if (!m) throw new Error(`the ${id} capture has no "${name}" mark — run promo:capture again`);
  return m;
}

// The camera rests at `top` (a fraction of the capture's height, at the view's top edge)
// between `from` and `to`, and travels between one rest and the next.
export type Hold = { from: number; to: number; top: number };
// `x`/`w`: the column of the capture that fills the view (the whole width by default).
// `px`: the size, in the app's own pixels, of the smallest text this shot asks a viewer to read.
export type ShotOpts = { x?: number; w?: number; px: number; overlay?: string; style?: string };

const travel = (cap: CaptureRef, view: View, o: ShotOpts) => {
  const width = view.width / (o.w ?? 1), height = (width * cap.height) / cap.width;
  const top = (t: number) => Math.round(Math.min(Math.max(0, t * height), Math.max(0, height - view.height)));
  return { width, height, top };
};

// The part of the capture the camera ever shows.
export function sweep(cap: CaptureRef, view: View, holds: Hold[], o: ShotOpts): Region {
  const g = travel(cap, view, o), tops = holds.map((h) => g.top(h.top));
  const first = Math.min(...tops), last = Math.max(...tops);
  return { x: o.x ?? 0, w: o.w ?? 1, y: first / g.height, h: Math.min(g.height - first, last - first + view.height) / g.height };
}

// A capture of the app as wide as its view, with the camera travelling down it. Overlays
// are placed in fractions of the capture, so they travel with it.
export function shot(sheet: Sheet, id: string, cap: CaptureRef, view: View, holds: Hold[], o: ShotOpts): string {
  const g = travel(cap, view, o);
  const at = (h: Hold) => `transform:translateY(${-g.top(h.top)}px)`;
  let move = at(holds[0]) + ";";
  if (holds.length > 1) {
    const t0 = holds[0].to, t1 = holds[holds.length - 1].from, pct = (t: number) => `${(((t - t0) / (t1 - t0)) * 100).toFixed(3)}%`;
    const frames = holds.map((h, k) =>
      (k > 0 ? `${pct(h.from)}{${at(h)}}` : "") + (k < holds.length - 1 ? `${pct(h.to)}{${at(h)};animation-timing-function:cubic-bezier(.6,0,.2,1)}` : "")).join("");
    move = sheet.anim(frames, t0, t1 - t0, "linear");
  }
  return `<div data-shot="${id}" data-css-width="${cap.cssWidth ?? cap.width}" data-px="${o.px}" style="position:absolute;inset:0;overflow:hidden;background:#fff;${o.style ?? ""}">
    <div style="position:absolute;left:${Math.round(-(o.x ?? 0) * g.width)}px;top:0;width:${Math.round(g.width)}px;height:${Math.round(g.height)}px;${move}">
      <img src="${cap.src}" alt="" style="display:block;width:100%;height:100%">${o.overlay ?? ""}
    </div></div>`;
}

// Drawn over a capture: an outline that lands on one of its parts.
export function ring(sheet: Sheet, m: Region, atMs: number, pad: number): string {
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  return `<div style="position:absolute;left:calc(${pct(m.x)} - ${pad}px);top:calc(${pct(m.y)} - ${pad}px);width:calc(${pct(m.w)} + ${2 * pad}px);height:calc(${pct(m.h)} + ${2 * pad}px);border:${Math.max(3, Math.round(pad * 0.3))}px solid ${BRAND};border-radius:${Math.round(pad * 1.2)}px;box-shadow:0 0 0 ${Math.round(pad * 0.5)}px rgba(29,78,216,.16);pointer-events:none;${sheet.anim("from{opacity:0;transform:scale(1.08)}to{opacity:1;transform:none}", atMs, 420)}"></div>`;
}
export const tapOn = (sheet: Sheet, m: Region, atMs: number, size: number) => tap(sheet, m.x + m.w / 2, m.y + m.h / 2, atMs, size);

// A tap: a dot that lands, and a ring that spreads from it.
export function tap(sheet: Sheet, fx: number, fy: number, atMs: number, size: number): string {
  const at = `position:absolute;left:${(fx * 100).toFixed(2)}%;top:${(fy * 100).toFixed(2)}%;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;pointer-events:none;`;
  const dot = sheet.anim("0%{opacity:0;transform:scale(1.7)}30%{opacity:.9;transform:scale(1)}70%{opacity:.9;transform:scale(.86)}100%{opacity:0;transform:scale(1)}", atMs - 260, 760, "ease-out");
  const ring = sheet.anim("0%{opacity:.75;transform:scale(.5)}100%{opacity:0;transform:scale(2.5)}", atMs, 620, "ease-out");
  return `<div style="${at}background:${BRAND};box-shadow:0 0 0 ${Math.round(size * 0.1)}px rgba(255,255,255,.85);${dot}"></div>
    <div style="${at}border:${Math.max(3, Math.round(size * 0.09))}px solid ${BRAND};opacity:0;${ring}"></div>`;
}

export type Frame = { rect: Rect; aspect: number; view: View; open: string; close: string };

// A phone: dark bezel, rounded screen. When it must be wider than fits the area (so the
// app's text reads), it keeps its shape and runs off the bottom edge of the video.
export function phoneFrame(visual: Rect, style = "", minWidth = 0, pageHeight = Infinity): Frame {
  let rect = fit(visual, 0.5);
  if (rect.width < minWidth) {
    const width = Math.min(Math.round(minWidth), visual.width);
    rect = { x: Math.round(visual.x + (visual.width - width) / 2), y: visual.y, width, height: width * 2 };
  }
  const bezel = Math.max(8, Math.round(rect.width * 0.03));
  const radius = Math.round(rect.width * 0.13);
  const width = rect.width - 2 * bezel, height = rect.height - 2 * bezel;
  return {
    rect, aspect: width / height, view: { width, height: Math.min(height, pageHeight - rect.y - bezel) },
    open: `<div data-frame="phone" style="${box(rect)}background:${INK};border-radius:${radius}px;padding:${bezel}px;overflow:hidden;box-shadow:0 ${Math.round(rect.width * 0.06)}px ${Math.round(rect.width * 0.16)}px rgba(24,36,56,.28);${style}">
      <div style="position:relative;width:100%;height:100%;border-radius:${radius - bezel}px;overflow:hidden;background:#fff">`,
    // A moving layer can escape the rounded clip in a frame grab, so the bezel is drawn over the corners too.
    close: `</div><div style="position:absolute;inset:${bezel}px;border-radius:${radius - bezel}px;box-shadow:0 0 0 ${radius}px ${INK};pointer-events:none"></div></div>`,
  };
}

// A browser window: a slim bar with three dots over a page of the given shape.
export function browserFrame(visual: Rect, aspect: number, style = ""): Frame {
  const barOf = (w: number) => Math.round(w * 0.042);
  let width = visual.width;
  let height = width / aspect + barOf(width);
  if (height > visual.height) { const k = visual.height / height; width = Math.floor(width * k); height = width / aspect + barOf(width); }
  const rect: Rect = { x: Math.round(visual.x + (visual.width - width) / 2), y: Math.round(visual.y + (visual.height - height) / 2), width: Math.round(width), height: Math.round(height) };
  const bar = barOf(rect.width), radius = Math.round(rect.width * 0.022), dot = Math.round(bar * 0.3);
  const dots = ["#f87171", "#fbbf24", "#34d399"].map((c) => `<span style="width:${dot}px;height:${dot}px;border-radius:50%;background:${c};display:block"></span>`).join("");
  return {
    rect, aspect: rect.width / (rect.height - bar), view: { width: rect.width, height: rect.height - bar },
    open: `<div data-frame="window" style="${box(rect)}background:#fff;border-radius:${radius}px;overflow:hidden;box-shadow:0 ${Math.round(rect.width * 0.03)}px ${Math.round(rect.width * 0.08)}px rgba(24,36,56,.2),0 0 0 1px rgba(24,36,56,.08);${style}">
      <div dir="ltr" style="height:${bar}px;background:#e7ebf1;display:flex;align-items:center;gap:${Math.round(dot * 0.7)}px;padding:0 ${Math.round(bar * 0.45)}px">${dots}</div>
      <div style="position:relative;width:100%;height:${rect.height - bar}px;overflow:hidden;background:#fff">`,
    close: "</div></div>",
  };
}
