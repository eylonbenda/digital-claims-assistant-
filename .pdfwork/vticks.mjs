// Find short vertical line segments (comb ticks) in a region.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), isEvalSupported: false }).promise;
const page = await doc.getPage(parseInt(process.argv[3] || '1', 10));
const yMin = parseFloat(process.argv[4] ?? '0');
const yMax = parseFloat(process.argv[5] ?? '99999');
const xMin = parseFloat(process.argv[6] ?? '0');
const xMax = parseFloat(process.argv[7] ?? '99999');
const ol = await page.getOperatorList();

const segs = [];
for (let i = 0; i < ol.fnArray.length; i++) {
  if (ol.fnArray[i] !== OPS.constructPath) continue;
  const coords = ol.argsArray[i][2];
  if (!coords || coords.length !== 4) continue;
  const x0 = coords[0], y0 = coords[1], x1 = coords[2], y1 = coords[3];
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (w < 2 && h > 2 && h < 20) {
    segs.push({ x: (x0+x1)/2, y: Math.min(y0,y1), y2: Math.max(y0,y1), h });
  }
}
segs.filter((b) => b.y >= yMin && b.y <= yMax && b.x >= xMin && b.x <= xMax)
  .sort((a, b) => a.x - b.x)
  .forEach((b) => console.log(`vtick x=${b.x.toFixed(1)}  y=${b.y.toFixed(1)}-${b.y2.toFixed(1)}`));
console.log(`-- vticks found: ${segs.length}`);
