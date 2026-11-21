import fs from "node:fs";
import path from "node:path";
import { TRAINING_ROOT } from "../../src/env.ts";
import type { Audience, PromoCopy } from "../copy.ts";
import type { Cut } from "../beats.ts";
import { BODY_FONT, HEADLINE_FONT, fontFaceCss } from "../fonts.ts";
import type { CaptureId } from "../manifest.ts";
import { SIZE, type Ratio } from "../timeline.ts";

export const INK = "#182438";
export const BRAND = "#1d4ed8";
export const CANVAS = "#f6f8fc";
export const CTA_GREEN = "#1faa55";
export const SOFT_BLUE = "#9db8ff"; // brand blue lifted for use on the ink background

export type CaptureRef = { src: string; width: number; height: number;
  cssWidth?: number; // the width of the app's window when the capture was taken
  marks?: Record<string, { x: number; y: number; w: number; h: number; px: number }>;
  avoid?: { what: "login" | "agent-word"; x: number; y: number; w: number; h: number }[];
};
export type BeatProps = {
  audience: Audience;
  cut: Cut;
  ratio: Ratio;
  durationMs: number;
  copy: PromoCopy;
  captures: Record<CaptureId, CaptureRef>;
  insurers: string[];
};
// What a beat puts on screen. `backdrop` is the part that changes the background (a reveal,
// a curtain): it stays when the beat's content leaves. `end` is the colour the beat ends on.
export type Scene = { body: string; background: string; backdrop?: string; end?: string };

export type Rect = { x: number; y: number; width: number; height: number };

// Where copy may sit. Stories and reels cover the top and bottom of a vertical video with
// their own interface, so the vertical frame gives up 14% at the top and 20% at the bottom.
export function safeRect(ratio: Ratio): Rect {
  const { width, height } = SIZE[ratio];
  const mx = Math.round(width * 0.05);
  if (ratio === "9x16") {
    const top = Math.round(height * 0.14), bottom = Math.round(height * 0.2);
    return { x: mx, y: top, width: width - 2 * mx, height: height - top - bottom };
  }
  const my = Math.round(height * 0.05);
  return { x: mx, y: my, width: width - 2 * mx, height: height - 2 * my };
}

// Type sizes and the split between copy and picture, per output shape. A picture is either
// "tall" (a phone) or "wide" (a browser window, the chat thread).
export type VisualKind = "tall" | "wide";
export type Layout = {
  ratio: Ratio; width: number; height: number; safe: Rect;
  row: boolean;        // true: copy beside the picture; false: copy above it
  copy: Rect; visual: Rect;
  headline: number; label: number; small: number;
  windowAspect: number; // shape of a browser window's page in this output
  minText: number;      // the smallest the app's own text may be once a capture is on screen
};

export function layoutFor(ratio: Ratio, kind: VisualKind = "wide"): Layout {
  const { width, height } = SIZE[ratio];
  const safe = safeRect(ratio);
  const minText = Math.ceil(Math.min(width, height) * 0.021);
  if (ratio === "16x9") {
    const copyW = 700, gap = 64;
    return {
      ratio, width, height, safe, minText, row: true, windowAspect: 1.1,
      copy: { x: safe.x + safe.width - copyW, y: safe.y, width: copyW, height: safe.height },
      visual: { x: safe.x, y: safe.y, width: safe.width - copyW - gap, height: safe.height },
      headline: 92, label: 70, small: 30,
    };
  }
  if (ratio === "1x1") {
    const type = { headline: 72, label: 54, small: 27 };
    if (kind === "tall") { // a phone beside its caption uses a square frame far better than one below it
      const copyW = 360, gap = 36; // narrow: the phone must be wide enough for its text to read
      return {
        ratio, width, height, safe, minText, row: true, windowAspect: 4 / 3, ...type,
        copy: { x: safe.x + safe.width - copyW, y: safe.y, width: copyW, height: safe.height },
        visual: { x: safe.x, y: safe.y, width: safe.width - copyW - gap, height: safe.height },
      };
    }
    const copyH = 262, gap = 22;
    return {
      ratio, width, height, safe, minText, row: false, windowAspect: 1.5, ...type,
      copy: { x: safe.x, y: safe.y, width: safe.width, height: copyH },
      visual: { x: safe.x, y: safe.y + copyH + gap, width: safe.width, height: safe.height - copyH - gap },
    };
  }
  // Vertical: the words stay inside the safe area; the picture may run on below it, where
  // the apps' own buttons cover only its lower edge.
  const copyH = 330, gap = 40, top = safe.y + copyH + gap;
  return {
    ratio, width, height, safe, minText, row: false, windowAspect: 0.85,
    copy: { x: safe.x, y: safe.y, width: safe.width, height: copyH },
    visual: { x: safe.x, y: top, width: safe.width, height: Math.round(height * 0.955) - top },
    headline: 96, label: 76, small: 36,
  };
}

// The largest box of the given aspect (width / height) that fits a rect, centred in it.
export function fit(r: Rect, aspect: number): Rect {
  let width = r.width, height = width / aspect;
  if (height > r.height) { height = r.height; width = height * aspect; }
  return { x: Math.round(r.x + (r.width - width) / 2), y: Math.round(r.y + (r.height - height) / 2), width: Math.round(width), height: Math.round(height) };
}

export const box = (r: Rect) => `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;`;
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Collects keyframes. Every animation runs on the composition's own clock: `startMs` is a
// delay from the beat's first frame and fill is "both", so seeking to any time is exact.
// `offset` is where that beat starts when several beats share one document.
export class Sheet {
  offset = 0;
  private rules: string[] = [];
  private n = 0;
  anim(keyframes: string, startMs: number, durMs: number, easing = "cubic-bezier(.2,.8,.2,1)"): string {
    const name = `k${this.n++}`;
    this.rules.push(`@keyframes ${name}{${keyframes}}`);
    return `animation:${name} ${Math.max(1, Math.round(durMs))}ms ${easing} ${Math.round(startMs + this.offset)}ms both;`;
  }
  rise(startMs: number, px = 46, durMs = 600): string {
    return this.anim(`from{opacity:0;transform:translateY(${px}px)}to{opacity:1;transform:none}`, startMs, durMs);
  }
  fadeIn(startMs: number, durMs = 300): string {
    return this.anim("from{opacity:0}to{opacity:1}", startMs, durMs, "linear");
  }
  fadeOut(startMs: number, durMs = 300): string {
    return this.anim("from{opacity:1}to{opacity:0}", startMs, durMs, "linear");
  }
  // Visible only between two times, with a short fade at each end.
  window(startMs: number, endMs: number, totalMs: number, fade = 260): string {
    const p = (ms: number) => `${Math.min(100, Math.max(0, (ms / totalMs) * 100)).toFixed(3)}%`;
    const a = startMs <= 0 ? "0%{opacity:1}" : `0%{opacity:0}${p(startMs)}{opacity:0}${p(startMs + fade)}{opacity:1}`;
    const b = endMs >= totalMs ? "100%{opacity:1}" : `${p(endMs - fade)}{opacity:1}${p(endMs)}{opacity:0}100%{opacity:0}`;
    return this.anim(a + b, 0, totalMs, "linear");
  }
  css(): string { return this.rules.join("\n"); }
}

export function page(l: Layout, background: string, sheet: Sheet, body: string, extraCss = ""): string {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{box-sizing:border-box}
html,body{margin:0;width:${l.width}px;height:${l.height}px;overflow:hidden;background:${background};color:${INK};font-family:"${BODY_FONT}",sans-serif}
.hl{font-family:"${HEADLINE_FONT}",serif;font-weight:900;line-height:1.12;margin:0;text-wrap:balance}
.lb{font-family:"${HEADLINE_FONT}",serif;font-weight:700;line-height:1.16;margin:0;text-wrap:balance}
.sm{font-weight:500;line-height:1.35;margin:0}
[data-copy]{display:block;max-width:100%;overflow-wrap:break-word}
${extraCss}
${sheet.css()}
</style></head><body><div style="position:absolute;inset:0;overflow:hidden">${body}</div></body></html>`;
}

const brandFile = (name: string) => path.join(TRAINING_ROOT, "..", "web", "public", "brand", name);
const cache = new Map<string, string>();
export function brandSvg(name: "logo.svg" | "logo-mono-white.svg" | "icon.svg"): string {
  let hit = cache.get(name);
  if (!hit) {
    hit = `data:image/svg+xml;base64,${fs.readFileSync(brandFile(name)).toString("base64")}`;
    cache.set(name, hit);
  }
  return hit;
}

// The copy block: stacked lines, centred in its area (beside the picture) or sitting at the
// bottom of it (above the picture) so the words stay close to what they describe.
export function copyBlock(l: Layout, inner: string): string {
  const align = l.row ? "justify-content:center;text-align:right;" : "justify-content:flex-end;text-align:center;align-items:center;";
  return `<div style="${box(l.copy)}display:flex;flex-direction:column;gap:${Math.round(l.small * 0.6)}px;${align}">${inner}</div>`;
}
