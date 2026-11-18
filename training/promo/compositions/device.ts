import { BRAND, INK, box, type CaptureRef, type Rect, type Sheet, fit } from "./layout.ts";

// A region of a capture: its centre and width as fractions of the capture. The height
// follows from the frame it is shown in, so a crop never distorts.
export type Crop = { cx: number; cy: number; w: number };
type Region = { x: number; y: number; w: number; h: number };

function region(cap: CaptureRef, crop: Crop, aspect: number): Region {
  let w = Math.min(1, crop.w);
  let h = (w * cap.width) / aspect / cap.height;
  if (h > 1) { h = 1; w = (h * cap.height * aspect) / cap.width; }
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
  return { x: clamp(crop.cx - w / 2, 1 - w), y: clamp(crop.cy - h / 2, 1 - h), w, h };
}

// One capture, cropped, filling its frame.
export function cropLayer(cap: CaptureRef, crop: Crop, aspect: number, style = ""): string {
  const r = region(cap, crop, aspect);
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  return `<div style="position:absolute;inset:0;overflow:hidden;${style}">
    <img src="${cap.src}" alt="" style="position:absolute;display:block;max-width:none;width:${pct(1 / r.w)};height:${pct(1 / r.h)};left:${pct(-r.x / r.w)};top:${pct(-r.y / r.h)}">
  </div>`;
}

// Where a point of the capture lands inside the frame (0..1 on each axis).
export function mapPoint(cap: CaptureRef, crop: Crop, aspect: number, px: number, py: number): { fx: number; fy: number } {
  const r = region(cap, crop, aspect);
  return { fx: (px - r.x) / r.w, fy: (py - r.y) / r.h };
}

// A tap: a dot that lands, and a ring that spreads from it.
export function tap(sheet: Sheet, fx: number, fy: number, atMs: number, size: number): string {
  const at = `position:absolute;left:${(fx * 100).toFixed(2)}%;top:${(fy * 100).toFixed(2)}%;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;pointer-events:none;`;
  const dot = sheet.anim("0%{opacity:0;transform:scale(1.7)}30%{opacity:.9;transform:scale(1)}70%{opacity:.9;transform:scale(.86)}100%{opacity:0;transform:scale(1)}", atMs - 260, 760, "ease-out");
  const ring = sheet.anim("0%{opacity:.75;transform:scale(.5)}100%{opacity:0;transform:scale(2.5)}", atMs, 620, "ease-out");
  return `<div style="${at}background:${BRAND};box-shadow:0 0 0 ${Math.round(size * 0.1)}px rgba(255,255,255,.85);${dot}"></div>
    <div style="${at}border:${Math.max(3, Math.round(size * 0.09))}px solid ${BRAND};opacity:0;${ring}"></div>`;
}

export type Frame = { rect: Rect; aspect: number; open: string; close: string };

// A phone: dark bezel, rounded screen.
export function phoneFrame(visual: Rect, style = ""): Frame {
  const rect = fit(visual, 0.5);
  const bezel = Math.max(8, Math.round(rect.width * 0.03));
  const radius = Math.round(rect.width * 0.13);
  const aspect = (rect.width - 2 * bezel) / (rect.height - 2 * bezel);
  return {
    rect, aspect,
    open: `<div data-frame="phone" style="${box(rect)}background:${INK};border-radius:${radius}px;padding:${bezel}px;box-shadow:0 ${Math.round(rect.width * 0.06)}px ${Math.round(rect.width * 0.16)}px rgba(24,36,56,.28);${style}">
      <div style="position:relative;width:100%;height:100%;border-radius:${radius - bezel}px;overflow:hidden;background:#fff">`,
    close: "</div></div>",
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
    rect, aspect: rect.width / (rect.height - bar),
    open: `<div data-frame="window" style="${box(rect)}background:#fff;border-radius:${radius}px;overflow:hidden;box-shadow:0 ${Math.round(rect.width * 0.03)}px ${Math.round(rect.width * 0.08)}px rgba(24,36,56,.2),0 0 0 1px rgba(24,36,56,.08);${style}">
      <div dir="ltr" style="height:${bar}px;background:#e7ebf1;display:flex;align-items:center;gap:${Math.round(dot * 0.7)}px;padding:0 ${Math.round(bar * 0.45)}px">${dots}</div>
      <div style="position:relative;width:100%;height:${rect.height - bar}px;overflow:hidden;background:#fff">`,
    close: "</div></div>",
  };
}
