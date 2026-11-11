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
const MARGIN = 50;
const RIGHT = W - MARGIN;
const WIDTH = W - 2 * MARGIN;
const MIN_SIZE = 8;
const LABEL_GAP = 6;

type Font = Awaited<ReturnType<PDFDocument["embedFont"]>>;
type Item =
  | { kind: "gap"; h: number }
  | { kind: "text"; text: string; scale: number; rule?: boolean }
  | { kind: "row"; label: string; value: string };

function wrap(text: string, width: number, size: number, font: Font): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const cand = line ? line + " " + word : word;
    if (line && font.widthOfTextAtSize(cand, size) > width) {
      lines.push(line);
      line = word;
    } else line = cand;
  }
  if (line) lines.push(line);
  return lines;
}

// Truncate with "…" so the last line fits `width`.
function clip(line: string, width: number, size: number, font: Font): string {
  if (font.widthOfTextAtSize(line, size) <= width) return line;
  let t = line;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > width) t = t.slice(0, -1);
  return t + "…";
}

export async function renderDemandPdf(doc: DemandDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(path.join(ASSETS, "app-hebrew.ttf")), {
    subset: false,
  });
  const page = pdf.addPage([W, H]);

  const items: Item[] = [];
  const text = (t: string, scale = 1) => items.push({ kind: "text", text: t, scale });
  const gap = (h: number) => items.push({ kind: "gap", h });
  const rowOf = (label: string, value: string) => items.push({ kind: "row", label, value });

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

  // Lay out at a given body size; returns total height and the draw ops.
  const layout = (body: number, truncate: boolean) => {
    const lh = body + 4;
    let height = 0;
    const ops: ((y: number) => void)[] = [];
    let offset = 0;
    const place = (h: number, draw?: (y: number) => void) => {
      if (draw) ops.push(((o) => (top: number) => draw(top - o))(offset));
      offset += h;
      height = offset;
    };
    // Remaining lines available for a long value when truncating.
    const budget = truncate ? Math.max(1, Math.floor((H - 2 * MARGIN) / lh)) : Infinity;
    for (const it of items) {
      if (it.kind === "gap") place(it.h * (body / 10));
      else if (it.kind === "text") {
        const sz = body * it.scale;
        place(sz + 5, (y) => {
          drawRightAnchored(page, it.text, RIGHT, y - sz, sz, font);
          if (it.rule) {
            page.drawLine({
              start: { x: MARGIN, y: y - sz - 3 },
              end: { x: RIGHT, y: y - sz - 3 },
              thickness: 0.6,
              color: rgb(0.4, 0.4, 0.4),
            });
          }
        });
      } else {
        const labelText = it.label + ":";
        const lw = font.widthOfTextAtSize(labelText, body);
        const vw = WIDTH - lw - LABEL_GAP;
        let lines = it.value ? wrap(it.value, vw, body, font) : [];
        if (truncate && lines.length > budget) {
          lines = lines.slice(0, budget);
          lines[budget - 1] = clip(lines[budget - 1] + "…", vw, body, font);
        }
        lines = lines.map((l) => clip(l, vw, body, font));
        const n = Math.max(1, lines.length);
        place(n * lh, (y) => {
          drawRightAnchored(page, labelText, RIGHT, y - body, body, font);
          if (!lines.length) {
            // blank value: short underline so the agent sees what's missing
            page.drawLine({
              start: { x: RIGHT - lw - LABEL_GAP - 110, y: y - body },
              end: { x: RIGHT - lw - LABEL_GAP, y: y - body },
              thickness: 0.5,
              color: rgb(0.6, 0.6, 0.6),
            });
          }
          lines.forEach((l, i) =>
            drawRightAnchored(page, l, RIGHT - lw - LABEL_GAP, y - body - i * lh, body, font),
          );
        });
      }
    }
    return { height, ops };
  };

  const avail = H - 2 * MARGIN;
  let body = 11;
  let res = layout(body, false);
  // layout() draws nothing until ops run, but wrap/clip is recomputed per size.
  while (res.height > avail && body > MIN_SIZE) {
    body -= 0.5;
    res = layout(body, false);
  }
  if (res.height > avail) res = layout(body, true);
  res.ops.forEach((draw) => draw(H - MARGIN));

  return pdf.save();
}
