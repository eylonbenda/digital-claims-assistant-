// Dump text items with PDF-space coordinates (origin bottom-left, y up — same as pdf-lib).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const file = process.argv[2];
const out = process.argv[3];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

const pages = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      s: it.str.replace(/\s+/g, ' ').trim(),
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
      w: Math.round(it.width || 0),
    }));
  pages.push({ page: p, width: Math.round(vp.width), height: Math.round(vp.height), items });
}

fs.writeFileSync(out, JSON.stringify(pages), 'utf8');
console.log(`wrote ${out} — pages=${pages.length}, page1 size=${pages[0].width}x${pages[0].height}, page1 items=${pages[0].items.length}`);
