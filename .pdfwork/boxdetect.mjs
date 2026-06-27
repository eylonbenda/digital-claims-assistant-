// Extract small vector rectangles (checkbox squares) from a PDF page via pdfjs.
// This pdfjs build encodes constructPath as args = [op, _, Float32Array]; a rectangle
// path has coords [x0, y0, x1, y1].
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), isEvalSupported: false }).promise;
const page = await doc.getPage(parseInt(process.argv[3] || '1', 10));
const yMin = parseFloat(process.argv[4] ?? '0');
const yMax = parseFloat(process.argv[5] ?? '99999');
const ol = await page.getOperatorList();

const boxes = [];
for (let i = 0; i < ol.fnArray.length; i++) {
  if (ol.fnArray[i] !== OPS.constructPath) continue;
  const coords = ol.argsArray[i][2];
  if (!coords || coords.length !== 4) continue;
  const x0 = coords[0], y0 = coords[1], x1 = coords[2], y1 = coords[3];
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (w > 3 && w < 16 && h > 3 && h < 16) {
    boxes.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w, h });
  }
}
boxes.filter((b) => b.y + b.h / 2 >= yMin && b.y + b.h / 2 <= yMax)
  .sort((a, b) => b.y - a.y || b.x - a.x)
  .forEach((b) => console.log(`box center=(${Math.round(b.x + b.w / 2)},${Math.round(b.y + b.h / 2)})  x=${Math.round(b.x)}-${Math.round(b.x + b.w)}  y=${Math.round(b.y)}-${Math.round(b.y + b.h)}`));
console.log(`-- squares found in band: total page squares=${boxes.length}`);
