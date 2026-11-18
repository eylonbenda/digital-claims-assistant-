import type { Composition } from "../renderer.ts";
import { CANVAS, INK, SOFT_BLUE, Sheet, box, brandSvg, copyBlock, esc, layoutFor, page, type BeatProps, type Layout } from "./layout.ts";

// "." ends a sentence; each sentence gets its own line.
export const sentences = (s: string): string[] => s.split(/(?<=\.)\s+/).filter(Boolean);

// The chase: the thread every office knows, filling up under the hook line.
// This is a drawing of life WITHOUT the product: a plain bubble thread, not our interface.
export function chase(p: BeatProps): Composition {
  const l = layoutFor(p.ratio), s = new Sheet(), T = p.durationMs;
  const hookSize = Math.round(l.headline * 0.8);
  const hook = sentences(p.copy.hook).map((line, i) =>
    `<p class="hl" data-copy="hook-${i}" style="font-size:${hookSize}px;color:${i === 0 ? "#fff" : SOFT_BLUE};${s.rise(60 + i * 260, 40, 520)}">${esc(line)}</p>`).join("");

  const font = Math.round(l.small * { "9x16": 1.4, "1x1": 1.12, "16x9": 1.5 }[l.ratio]);
  const cardW = Math.min(l.visual.width, l.ratio === "1x1" ? 860 : 960);
  const pad = Math.round(font * 0.8);
  const bubble = (i: number, inner: string, extra = "") => {
    const mine = i % 2 === 1; // the business answers in green, from the other side
    const at = T * (0.1 + i * 0.16);
    return `<div style="align-self:${mine ? "flex-end" : "flex-start"};max-width:82%;background:${mine ? "#dcf8c6" : "#fff"};border-radius:${Math.round(font * 0.6)}px;padding:${Math.round(font * 0.42)}px ${Math.round(font * 0.7)}px;box-shadow:0 2px 5px rgba(0,0,0,.1);font-size:${font}px;font-weight:500;line-height:1.3;${extra}${s.anim("from{opacity:0;transform:translateY(22px) scale(.94)}to{opacity:1;transform:none}", at, 380)}">${inner}</div>`;
  };
  const photoH = Math.round(font * 2.6);
  const bubbles = p.copy.chat.map((text, i) => i === 2
    ? bubble(i, `<div style="width:${Math.round(font * 6.4)}px;height:${photoH}px;border-radius:${Math.round(font * 0.4)}px;background:linear-gradient(135deg,#b8bfca,#d7dbe2 55%,#aab1bd);filter:blur(3px)"></div>
        <span data-copy="chat-${i}" style="font-size:${Math.round(font * 0.72)}px;color:#7c8798;margin-top:${Math.round(font * 0.3)}px">${esc(text)}</span>`)
    : bubble(i, `<span data-copy="chat-${i}">${esc(text)}</span>`)).join("");

  const thread = `<div style="${box(l.visual)}display:flex;align-items:${l.row ? "center" : "flex-start"};justify-content:center">
    <div data-frame="thread" style="width:${cardW}px;background:#efeae2;border-radius:${Math.round(font * 1.1)}px;padding:${pad}px;display:flex;flex-direction:column;gap:${Math.round(font * 0.42)}px;box-shadow:0 30px 80px rgba(0,0,0,.35);${s.rise(0, 60, 500)}">${bubbles}</div>
  </div>`;
  return { html: page(l, INK, s, copyBlock(l, hook) + thread), durationMs: T };
}

// A column of lines centred in the safe area, for the beats that are words only.
export function centred(l: Layout, inner: string, gap: number): string {
  return `<div style="${box(l.safe)}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${gap}px">${inner}</div>`;
}

// A disc of the next background colour growing from the middle: the cut between moods.
export function reveal(s: Sheet, l: Layout, colour: string, startMs: number, durMs: number): string {
  const d = Math.ceil(Math.hypot(l.width, l.height) * 1.05);
  return `<div style="position:absolute;left:${(l.width - d) / 2}px;top:${(l.height - d) / 2}px;width:${d}px;height:${d}px;border-radius:50%;background:${colour};${s.anim("from{transform:scale(0)}to{transform:scale(1)}", startMs, durMs, "cubic-bezier(.6,0,.2,1)")}"></div>`;
}

// The turn: the noise clears, and the answer is one line.
export function turn(p: BeatProps): Composition {
  const l = layoutFor(p.ratio), s = new Sheet(), T = p.durationMs;
  const logoW = Math.round(Math.min(l.safe.width * 0.62, 640));
  const body = reveal(s, l, CANVAS, 0, T * 0.3) + centred(l, `
    <img data-frame="logo" src="${brandSvg("logo.svg")}" alt="" style="width:${logoW}px;display:block;${s.rise(T * 0.16, 40, 560)}">
    ${sentences(p.copy.turn).map((line, i) => `<p class="hl" data-copy="turn-${i}" style="font-size:${l.headline}px;${i === 1 ? "color:#1d4ed8;" : ""}${s.rise(T * (0.3 + i * 0.13), 50, 600)}">${esc(line)}</p>`).join("")}
  `, Math.round(l.headline * 0.22));
  return { html: page(l, INK, s, body), durationMs: T };
}
