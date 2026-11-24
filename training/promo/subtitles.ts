// Subtitles: the narrator's words on the picture, a phrase at a time, for people who watch
// with the sound off. They are cut from the same script the voice reads, so the two cannot
// drift apart.
import type { Ratio } from "./timeline.ts";

// The longest phrase shown at once, in characters, and how it is drawn, per output shape.
// `bottom` is a share of the height: the vertical film keeps clear of the apps' own buttons.
export const SUBTITLE: Record<Ratio, { max: number; size: number; bottom: number }> = {
  "9x16": { max: 30, size: 54, bottom: 0.215 },
  "1x1": { max: 34, size: 44, bottom: 0.04 },
  "16x9": { max: 44, size: 50, bottom: 0.045 },
};

// A line of narration as phrases short enough to read at a glance. Breaks fall on the
// line's own punctuation; a clause that is still too long is split evenly between words.
export function chunks(line: string, max: number): string[] {
  // Clauses with the mark that ended them: "," and ":" may be joined to the next clause.
  const clauses = [...line.matchAll(/([^.,:?!]+)([.,:?!]?)/g)].map((m) => ({ text: m[1].trim(), mark: m[2] })).filter((c) => c.text);
  const out: string[] = [];
  let held = "", open = false; // `open`: the held phrase ended in a comma, so more may join it
  const flush = () => { if (held) out.push(...split(held, max)); held = ""; };
  for (const c of clauses) {
    const text = c.mark === "?" || c.mark === "!" ? c.text + c.mark : c.text;
    if (held && open && `${held}, ${text}`.length <= max) held = `${held}, ${text}`;
    else { flush(); held = text; }
    open = c.mark === ",";
    if (!open) flush();
  }
  flush();
  return out;
}

function split(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const target = text.length / Math.ceil(text.length / max), out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && (next.length > max || cur.length >= target)) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// When each phrase of a line is on screen: the line's time, shared by length.
export type Subtitle = { text: string; from: number; to: number };
export function timed(parts: string[], at: number, seconds: number): Subtitle[] {
  const total = parts.reduce((s, p) => s + p.length, 0);
  let t = at;
  return parts.map((text) => {
    const from = t;
    t += (seconds * text.length) / total;
    return { text, from, to: t };
  });
}

// The video half of the final filter: one picture per subtitle (inputs `first`, …), each
// laid over the film for its own time only.
export function subtitleFilter(subs: Subtitle[], first: number, from: string, out: string): string {
  if (subs.length === 0) return `[${from}]null[${out}]`;
  return subs.map((s, i) => {
    const src = i === 0 ? from : `s${i - 1}`, dst = i === subs.length - 1 ? out : `s${i}`;
    return `[${src}][${first + i}:v]overlay=0:0:enable='between(t,${s.from.toFixed(3)},${s.to.toFixed(3)})'[${dst}]`;
  }).join(";");
}
