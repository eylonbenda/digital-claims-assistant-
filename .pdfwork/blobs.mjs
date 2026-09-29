// Find horizontally-separated ink blobs (e.g. circle glyphs) within a y pixel band of a PNG.
// Usage: blobs.mjs <png> <yPxTop> <yPxBot> [xOffsetPt] [yOffsetPt] [scale]
// If xOffsetPt/yOffsetPt/scale given, also prints PDF coords (yOffsetPt = crop's yTop in pt).
import { PNG } from 'pngjs';
import fs from 'fs';

const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const yTop = parseInt(process.argv[3], 10);
const yBot = parseInt(process.argv[4], 10);
const xOff = parseFloat(process.argv[5] ?? 'NaN');
const yOffTop = parseFloat(process.argv[6] ?? 'NaN');
const scale = parseFloat(process.argv[7] ?? 'NaN');
const gapPx = parseInt(process.argv[8] ?? '3', 10);

const isInk = (x, y) => {
  const idx = (png.width * y + x) << 2;
  const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
  return r < 200 || g < 200 || b < 200;
};

// column has ink in band
const colHasInk = new Array(png.width).fill(false);
for (let x = 0; x < png.width; x++) {
  for (let y = yTop; y < yBot; y++) {
    if (isInk(x, y)) { colHasInk[x] = true; break; }
  }
}
// runs of consecutive ink columns = blobs (gap of >=2 cols splits blobs)
let runs = [];
let start = -1, gap = 0;
for (let x = 0; x < png.width; x++) {
  if (colHasInk[x]) {
    if (start === -1) start = x;
    gap = 0;
  } else if (start !== -1) {
    gap++;
    if (gap > gapPx) { runs.push([start, x - gap]); start = -1; gap = 0; }
  }
}
if (start !== -1) runs.push([start, png.width - 1]);

runs.forEach(([a, b]) => {
  // vertical extent within this x-range
  let yMin = Infinity, yMax = -Infinity;
  for (let x = a; x <= b; x++) {
    for (let y = yTop; y < yBot; y++) {
      if (isInk(x, y)) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
    }
  }
  const cx = (a + b) / 2, cy = (yMin + yMax) / 2;
  let extra = '';
  if (!isNaN(scale)) {
    const xPdf = xOff + cx / scale;
    const yPdfTop = yOffTop + cy / scale;
    extra = `  x_pdf=${xPdf.toFixed(2)} y_top_pdf=${yPdfTop.toFixed(2)}`;
  }
  console.log(`blob xpx=${a}-${b} ypx=${yMin}-${yMax} w=${b - a} h=${yMax - yMin}${extra}`);
});
