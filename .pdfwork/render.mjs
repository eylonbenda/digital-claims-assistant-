// Render a PDF page (or a vertical crop) to PNG using mupdf (pure WASM).
// Usage: render.mjs <src> <out> [page=1] [scale=2] [yTop_pt] [yBot_pt]
//   yTop/yBot are in PDF points from the TOP of the page (optional crop band).
import * as mupdf from 'mupdf';
import fs from 'fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const pageNum = parseInt(process.argv[4] || '1', 10) - 1;
const scale = parseFloat(process.argv[5] || '2');

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const page = doc.loadPage(pageNum);
const b = page.getBounds(); // [x0,y0,x1,y1], y down from top
const W = b[2] - b[0];
const H = b[3] - b[1];

let pix;
if (process.argv[6] !== undefined) {
  const yTop = parseFloat(process.argv[6]);
  const yBot = parseFloat(process.argv[7] || String(H));
  const bbox = [0, Math.round(yTop * scale), Math.round(W * scale), Math.round(yBot * scale)];
  pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
  page.run(dev, mupdf.Matrix.identity);
  dev.close();
} else {
  pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
}

fs.writeFileSync(OUT, pix.asPNG());
console.log(`wrote ${OUT} — ${pix.getWidth()}x${pix.getHeight()}`);
