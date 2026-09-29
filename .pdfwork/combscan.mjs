// Scan a vertical strip of a PDF page for vertical ink lines (borders + comb ticks),
// classifying by how tall each ink column is (fraction of the scanned band height).
// Usage: combscan.mjs <pdf> <page1based> <xLeft> <yTop> <xRight> <yBot> <scale>
import * as mupdf from 'mupdf';
import fs from 'fs';

const SRC = process.argv[2];
const pageNum = parseInt(process.argv[3] || '1', 10) - 1;
const xLeft = parseFloat(process.argv[4]);
const yTop = parseFloat(process.argv[5]);
const xRight = parseFloat(process.argv[6]);
const yBot = parseFloat(process.argv[7]);
const scale = parseFloat(process.argv[8] || '20');

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const page = doc.loadPage(pageNum);
const bbox = [Math.round(xLeft * scale), Math.round(yTop * scale), Math.round(xRight * scale), Math.round(yBot * scale)];
const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
pix.clear(255);
const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
page.run(dev, mupdf.Matrix.identity);
dev.close();

const w = pix.getWidth(), h = pix.getHeight();
const data = pix.getPixels(); // Uint8Array RGB
const colInk = new Array(w).fill(0);
for (let x = 0; x < w; x++) {
  let count = 0;
  for (let y = 0; y < h; y++) {
    const idx = (w * y + x) * 3;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    if (r < 200 || g < 200 || b < 200) count++;
  }
  colInk[x] = count / h;
}
// Find runs of columns with ink fraction above a threshold (candidate vertical strokes)
const threshold = 0.15;
let runs = [];
let start = -1;
for (let x = 0; x < w; x++) {
  if (colInk[x] > threshold) {
    if (start === -1) start = x;
  } else {
    if (start !== -1) { runs.push([start, x - 1]); start = -1; }
  }
}
if (start !== -1) runs.push([start, w - 1]);
runs.forEach(([a, b2]) => {
  const cx = (a + b2) / 2;
  const maxFrac = Math.max(...Array.from({length: b2-a+1}, (_,i)=>colInk[a+i]));
  const xPdf = xLeft + cx / scale;
  console.log(`run px=${a}-${b2} centerPx=${cx.toFixed(1)} x_pdf=${xPdf.toFixed(2)} maxInkFrac=${maxFrac.toFixed(2)}`);
});
