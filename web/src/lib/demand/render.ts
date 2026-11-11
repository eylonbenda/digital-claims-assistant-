// One-page A4 demand-form PDF from a DemandDoc. Everything right-anchored (Hebrew). Strings are
// kept in logical order; pdf-lib + fontkit shape RTL, so never reverse them.
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS, drawRightAnchored } from "../formfill/engine";
import type { DemandDoc } from "./data";

const W = 595.28;
const H = 841.89;
export const MARGIN = 50;
const RIGHT = W - MARGIN;
const WIDTH = W - 2 * MARGIN;
const MIN_SIZE = 8;
const LABEL_GAP = 6;

type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;
// Measuring with the non-subset font is slow; memoise per font/size/text.
const widthMemo = new WeakMap<object, Map<string, number>>();
function widthOf(font: Font, text: string, size: number): number {
  let m = widthMemo.get(font);
  if (!m) widthMemo.set(font, (m = new Map()));
  const k = size + "|" + text;
  let w = m.get(k);
  if (w === undefined) m.set(k, (w = font.widthOfTextAtSize(text, size)));
  return w;
}

type Item =
  | { kind: "gap"; h: number }
  | { kind: "text"; text: string; scale: number; rule?: boolean }
  | { kind: "row"; label: string; value: string };

// Greedy wrap on spaces in logical order. Widths are sums of per-word widths (O(words), not
// O(words x line length)); clip() afterwards guarantees no line exceeds the width.
function wrap(text: string, width: number, size: number, font: Font): string[] {
  const lines: string[] = [];
  const space = widthOf(font, " ", size);
  let line = "";
  let lineW = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = widthOf(font, word, size);
    if (line && lineW + space + w > width) {
      lines.push(line);
      line = word;
      lineW = w;
    } else {
      lineW = line ? lineW + space + w : w;
      line = line ? line + " " + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Truncate with "…" so the last line fits `width`.
function clip(line: string, width: number, size: number, font: Font): string {
  if (widthOf(font, line, size) <= width) return line;
  let lo = 0;
  let hi = line.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (widthOf(font, line.slice(0, mid) + "…", size) <= width) lo = mid;
    else hi = mid - 1;
  }
  return line.slice(0, lo) + "…";
}

export type DrawnText = { text: string; y: number };

export async function renderDemandPdf(doc: DemandDoc): Promise<Uint8Array> {
  return (await renderDemandPdfDebug(doc)).bytes;
}

// Same as renderDemandPdf, also returning every text line drawn (for layout tests).
export async function renderDemandPdfDebug(
  doc: DemandDoc,
): Promise<{ bytes: Uint8Array; drawn: DrawnText[] }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(path.join(ASSETS, "app-hebrew.ttf")), {
    subset: false,
  });
  const page = pdf.addPage([W, H]);
  const drawn: DrawnText[] = [];

  // The page holds a few thousand characters at the 8pt floor; bound input so layout stays fast.
  const bound = (v: string, max: number) => (v.length > max ? v.slice(0, max - 1) + "…" : v);
  const items: Item[] = [];
  const text = (t: string, scale = 1) => items.push({ kind: "text", text: bound(t, 300), scale });
  const gap = (h: number) => items.push({ kind: "gap", h });
  const rowOf = (label: string, value: string) => items.push({ kind: "row", label, value: bound(value, 1500) });

  if (doc.sender.name) text(doc.sender.name);
  if (doc.sender.phone) text(doc.sender.phone);
  if (doc.sender.email) text(doc.sender.email);
  gap(10);
  text(`תאריך: ${doc.date}`);
  gap(8);
  text("לכבוד");
  text(doc.addressee || "________________");
  gap(14);
  items.push({ kind: "text", text: doc.title, scale: 1.7, rule: true });
  gap(8);
  doc.subtitle.forEach((r) => rowOf(r.label, r.value));
  for (const sec of doc.sections) {
    gap(12);
    items.push({ kind: "text", text: sec.heading, scale: 1.2, rule: true });
    gap(2);
    sec.rows.forEach((r) => rowOf(r.label, r.value));
  }

  const wrapMemo = new Map<string, string[]>();
  const wrapCached = (idx: number, value: string, vw: number, body: number) => {
    const k = `${idx}|${body}`;
    let r = wrapMemo.get(k);
    if (!r) wrapMemo.set(k, (r = wrap(value, vw, body, font)));
    return r;
  };

  // `caps`: per-row (index in `items`) cap on wrapped lines; absent = uncapped.
  const layout = (body: number, caps: Map<number, number>) => {
    const lh = body + 4;
    let offset = 0;
    const ops: ((top: number) => void)[] = [];
    const rowLines = new Map<number, number>();
    const put = (t: string, x: number, y: number, size: number) => {
      if (y < MARGIN) return; // last-resort guard: never draw below the bottom margin
      drawn.push({ text: t, y });
      drawRightAnchored(page, t, x, y, size, font);
    };
    items.forEach((it, idx) => {
      const o = offset;
      if (it.kind === "gap") offset += it.h * (body / 10);
      else if (it.kind === "text") {
        const sz = body * it.scale;
        const t = clip(it.text, WIDTH, sz, font);
        offset += sz + 5;
        ops.push((top) => {
          const y = top - o - sz;
          put(t, RIGHT, y, sz);
          if (it.rule && y - 3 >= MARGIN) {
            page.drawLine({
              start: { x: MARGIN, y: y - 3 },
              end: { x: RIGHT, y: y - 3 },
              thickness: 0.6,
              color: rgb(0.4, 0.4, 0.4),
            });
          }
        });
      } else {
        const labelText = it.label + ":";
        const lw = widthOf(font, labelText, body);
        const vw = WIDTH - lw - LABEL_GAP;
        let lines = it.value ? wrapCached(idx, it.value, vw, body) : [];
        rowLines.set(idx, lines.length);
        const cap = caps.get(idx);
        if (cap !== undefined && lines.length > cap) {
          lines = lines.slice(0, cap);
          lines[cap - 1] = lines[cap - 1] + "…";
        }
        lines = lines.map((l) => clip(l, vw, body, font));
        offset += Math.max(1, lines.length) * lh;
        ops.push((top) => {
          const y = top - o - body;
          put(labelText, RIGHT, y, body);
          if (!lines.length && y >= MARGIN) {
            // blank value: short underline so the agent sees what's missing
            page.drawLine({
              start: { x: RIGHT - lw - LABEL_GAP - 110, y },
              end: { x: RIGHT - lw - LABEL_GAP, y },
              thickness: 0.5,
              color: rgb(0.6, 0.6, 0.6),
            });
          }
          lines.forEach((l, i) => put(l, RIGHT - lw - LABEL_GAP, y - i * lh, body));
        });
      }
    });
    return { height: offset, ops, rowLines };
  };

  const avail = H - 2 * MARGIN;
  let body = 11;
  let res = layout(body, new Map());
  while (res.height > avail && body > MIN_SIZE) {
    body -= 0.5;
    res = layout(body, new Map());
  }
  // At the floor: cap the longest value one line at a time until it fits.
  const caps = new Map<number, number>();
  while (res.height > avail) {
    let best = -1;
    let bestN = 1;
    res.rowLines.forEach((n, idx) => {
      const n2 = Math.min(n, caps.get(idx) ?? n);
      if (n2 > bestN) {
        best = idx;
        bestN = n2;
      }
    });
    if (best < 0) break; // nothing left to cut; the draw guard keeps us inside the margin
    // Cut the longest value by its share of the excess (>=1 line) so this converges fast.
    let multi = 0;
    res.rowLines.forEach((n, idx) => {
      if (Math.min(n, caps.get(idx) ?? n) > 1) multi++;
    });
    const excess = Math.ceil((res.height - avail) / (body + 4));
    const cut = Math.max(1, Math.min(bestN - 1, Math.ceil(excess / multi)));
    caps.set(best, bestN - cut);
    res = layout(body, caps);
  }
  res.ops.forEach((draw) => draw(H - MARGIN));

  return { bytes: await pdf.save(), drawn };
}
