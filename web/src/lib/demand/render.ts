// A4 demand-form PDF from a DemandDoc — one page, flowing onto more only when shrinking and capping
// cannot fit it. Everything right-anchored (Hebrew). Strings are kept in logical order; pdf-lib +
// fontkit shape RTL, so never reverse them. Money rows are never capped, clipped or dropped.
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS, drawRightAnchored } from "../formfill/engine";
import type { DemandDoc } from "./data";
import { COPY } from "./copy";

const W = 595.28;
const H = 841.89;
export const MARGIN = 50;
const RIGHT = W - MARGIN;
const WIDTH = W - 2 * MARGIN;
const MIN_SIZE = 8;
const LABEL_GAP = 6;

type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;
type Page = ReturnType<PDFDocument["addPage"]>;
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

// `keep`: never end a page right after this item (a heading travels with its first row).
type Item =
  | { kind: "gap"; h: number; keep?: boolean }
  | { kind: "text"; text: string; scale: number; rule?: boolean; keep?: boolean }
  | { kind: "row"; label: string; value: string; money?: "money" | "total" };

// One laid-out item: its height, and how to draw it with its top edge at `top`.
type Block = { h: number; gap: boolean; keep: boolean; draw: (page: Page, top: number) => void };

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

// Truncate with "…" so the last line fits `width`. Never applied to money rows.
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

// `page` is 0-based.
export type DrawnText = { text: string; y: number; page: number };

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
  const drawn: DrawnText[] = [];
  const pages: Page[] = [];

  // A page holds a few thousand characters at the 8pt floor; bound input so layout stays fast.
  // Money values are short and exact, so they are never bounded.
  const bound = (v: string, max: number) => (v.length > max ? v.slice(0, max - 1) + "…" : v);
  const items: Item[] = [];
  const text = (t: string, scale = 1) => items.push({ kind: "text", text: bound(t, 300), scale });
  const gap = (h: number) => items.push({ kind: "gap", h });
  const rowOf = (label: string, value: string, money?: "money" | "total") =>
    items.push({ kind: "row", label, value: money ? value : bound(value, 1500), money });

  if (doc.sender.name) text(doc.sender.name);
  if (doc.sender.phone) text(doc.sender.phone);
  if (doc.sender.email) text(doc.sender.email);
  gap(10);
  text(`${COPY.datePrefix} ${doc.date}`);
  gap(8);
  text(COPY.addresseePrefix);
  text(doc.addressee || "________________");
  gap(14);
  items.push({ kind: "text", text: doc.title, scale: 1.7, rule: true, keep: true });
  items.push({ kind: "gap", h: 8, keep: true });
  doc.subtitle.forEach((r) => rowOf(r.label, r.value));
  for (const sec of doc.sections) {
    gap(12);
    items.push({ kind: "text", text: sec.heading, scale: 1.2, rule: true, keep: true });
    items.push({ kind: "gap", h: 2, keep: true });
    sec.rows.forEach((r) => rowOf(r.label, r.value, r.kind));
  }

  const wrapMemo = new Map<string, string[]>();
  const wrapCached = (idx: number, value: string, vw: number, body: number) => {
    const k = `${idx}|${body}`;
    let r = wrapMemo.get(k);
    if (!r) wrapMemo.set(k, (r = wrap(value, vw, body, font)));
    return r;
  };

  const put = (page: Page, t: string, x: number, y: number, size: number) => {
    if (y < MARGIN) return; // last-resort guard; pagination keeps every block above MARGIN
    drawn.push({ text: t, y, page: pages.indexOf(page) });
    drawRightAnchored(page, t, x, y, size, font);
  };
  const rule = (page: Page, y: number, left = MARGIN) => {
    if (y < MARGIN) return;
    page.drawLine({ start: { x: left, y }, end: { x: RIGHT, y }, thickness: 0.6, color: rgb(0.4, 0.4, 0.4) });
  };

  // `caps`: per-row (index in `items`) cap on wrapped lines; absent = uncapped. Money rows are
  // never in `rowLines`, so the cap loop can't touch them.
  const layout = (body: number, caps: Map<number, number>) => {
    const lh = body + 4;
    const blocks: Block[] = [];
    const rowLines = new Map<number, number>();
    items.forEach((it, idx) => {
      if (it.kind === "gap") {
        blocks.push({ h: it.h * (body / 10), gap: true, keep: !!it.keep, draw: () => {} });
      } else if (it.kind === "text") {
        const sz = body * it.scale;
        const t = clip(it.text, WIDTH, sz, font);
        blocks.push({
          h: sz + 5,
          gap: false,
          keep: !!it.keep,
          draw: (page, top) => {
            const y = top - sz;
            put(page, t, RIGHT, y, sz);
            if (it.rule) rule(page, y - 3);
          },
        });
      } else if (it.money) {
        // Never wrapped, capped or clipped. Wider than the value column -> value on its own line.
        // The total is emphasised by size + a rule above (the font has a single weight, no bold).
        const total = it.money === "total";
        const sz = total ? body * 1.1 : body;
        const pad = total ? 5 : 0;
        const labelText = it.label + ":";
        const lw = widthOf(font, labelText, sz);
        const own = widthOf(font, it.value, sz) > WIDTH - lw - LABEL_GAP;
        const rlh = sz + 4;
        blocks.push({
          h: pad + (own ? 2 : 1) * rlh,
          gap: false,
          keep: false,
          draw: (page, top) => {
            const y = top - pad - sz;
            if (total) rule(page, top - 2, RIGHT - Math.min(WIDTH, 220));
            put(page, labelText, RIGHT, y, sz);
            if (own) put(page, it.value, RIGHT, y - rlh, sz);
            else put(page, it.value, RIGHT - lw - LABEL_GAP, y, sz);
          },
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
        blocks.push({
          h: Math.max(1, lines.length) * lh,
          gap: false,
          keep: false,
          draw: (page, top) => {
            const y = top - body;
            put(page, labelText, RIGHT, y, body);
            if (!lines.length && y >= MARGIN) {
              // blank value: short underline so the agent sees what's missing
              page.drawLine({
                start: { x: RIGHT - lw - LABEL_GAP - 110, y },
                end: { x: RIGHT - lw - LABEL_GAP, y },
                thickness: 0.5,
                color: rgb(0.6, 0.6, 0.6),
              });
            }
            lines.forEach((l, i) => put(page, l, RIGHT - lw - LABEL_GAP, y - i * lh, body));
          },
        });
      }
    });
    return { height: blocks.reduce((a, b) => a + b.h, 0), blocks, rowLines };
  };

  const avail = H - 2 * MARGIN;
  let body = 11;
  let res = layout(body, new Map());
  while (res.height > avail && body > MIN_SIZE) {
    body -= 0.5;
    res = layout(body, new Map());
  }
  // At the floor: cap the longest non-money value one line at a time until it fits — but only
  // when capping can fit one page at all. Otherwise stop capping (it would cut text for nothing)
  // and paginate the uncapped layout.
  const capAll = new Map<number, number>();
  res.rowLines.forEach((_, idx) => capAll.set(idx, 1));
  if (res.height > avail && layout(body, capAll).height <= avail) {
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
      if (best < 0) break; // unreachable: all-capped fits
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
  }

  const placed = flowBlocks(res.blocks, avail);
  pages.push(pdf.addPage([W, H]));
  placed.forEach((p, i) => {
    if (!p) return;
    while (pages.length <= p.page) pages.push(pdf.addPage([W, H]));
    res.blocks[i].draw(pages[p.page], H - MARGIN - p.offset);
  });

  return { bytes: await pdf.save(), drawn };
}

// Flow blocks top to bottom over pages of height `avail`. A new page starts when the next block
// — plus the blocks it must `keep` with — would overflow. Gaps never open a page (null = skipped).
// Returns each block's page (0-based) and its top offset from the page's top margin.
export function flowBlocks(
  blocks: readonly { h: number; gap: boolean; keep: boolean }[],
  avail: number,
): ({ page: number; offset: number } | null)[] {
  const out: ({ page: number; offset: number } | null)[] = [];
  let page = 0;
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.gap && used === 0 && page > 0) {
      out.push(null);
      continue;
    }
    let chain = 0;
    for (let j = i; j < blocks.length; j++) {
      chain += blocks[j].h;
      if (!blocks[j].keep) break;
    }
    if (used > 0 && used + Math.min(chain, avail) > avail) {
      page++;
      used = 0;
      if (b.gap) {
        out.push(null);
        continue;
      }
    }
    out.push({ page, offset: used });
    used += b.h;
  }
  return out;
}
