// Horizontal analogue of combscan: find horizontal ink lines (row borders) in a region.
// Usage: hcombscan.mjs <pdf> <page1based> <xLeft> <yTop> <xRight> <yBot> <scale>
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
const data = pix.getPixels();
const rowInk = new Array(h).fill(0);
for (let y = 0; y < h; y++) {
  let count = 0;
  for (let x = 0; x < w; x++) {
    const idx = (w * y + x) * 3;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    if (r < 200 || g < 200 || b < 200) count++;
  }
  rowInk[y] = count / w;
}
const threshold = 0.5;
let runs = [];
let start = -1;
for (let y = 0; y < h; y++) {
  if (rowInk[y] > threshold) {
    if (start === -1) start = y;
  } else {
    if (start !== -1) { runs.push([start, y - 1]); start = -1; }
  }
}
if (start !== -1) runs.push([start, h - 1]);
runs.forEach(([a, b2]) => {
  const cy = (a + b2) / 2;
  const yPdfTop = yTop + cy / scale;
  const yPdfBottom = 842 - yPdfTop; // assumes A4 842pt page height; adjust if not
  console.log(`row px=${a}-${b2} y_top=${yPdfTop.toFixed(2)} y_bottom-based=${yPdfBottom.toFixed(2)}`);
});
