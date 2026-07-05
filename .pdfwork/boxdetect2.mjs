// Extract small vector rectangles (checkbox squares) from a PDF page via pdfjs,
// composing the local `transform` op (cm) that precedes constructPath.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), isEvalSupported: false }).promise;
const page = await doc.getPage(parseInt(process.argv[3] || '1', 10));
const yMin = parseFloat(process.argv[4] ?? '0');
const yMax = parseFloat(process.argv[5] ?? '99999');
const ol = await page.getOperatorList();
const view = page.view; // [x0,y0,x1,y1]
const pageH = view[3] - view[1];

// track current transform (cm) — pdfjs 'transform' op args are [a,b,c,d,e,f], applied via ctx.transform
// which is cumulative with existing ctx state; but since each box does save/transform/constructPath/restore,
// the transform is relative to whatever the ambient CTM was at 'save' time. We need to track a full stack.
let stack = [[1,0,0,1,0,0]]; // identity
function mul(m1, m2) {
  // m1 applied first, then m2 (m2 is new op, m1 is current ctm) -> result = m2 * m1 in pdf convention
  const [a1,b1,c1,d1,e1,f1] = m1;
  const [a2,b2,c2,d2,e2,f2] = m2;
  return [
    a1*a2 + b1*c2,
    a1*b2 + b1*d2,
    c1*a2 + d1*c2,
    c1*b2 + d1*d2,
    e1*a2 + f1*c2 + e2,
    e1*b2 + f1*d2 + f2,
  ];
}
function apply(m, x, y) {
  const [a,b,c,d,e,f] = m;
  return [a*x + c*y + e, b*x + d*y + f];
}

const boxes = [];
let ctm = stack[0];
for (let i = 0; i < ol.fnArray.length; i++) {
  const op = ol.fnArray[i];
  if (op === OPS.save) {
    stack.push(ctm);
  } else if (op === OPS.restore) {
    ctm = stack.pop() || [1,0,0,1,0,0];
  } else if (op === OPS.transform) {
    const args = ol.argsArray[i];
    ctm = mul(ctm, args);
  } else if (op === OPS.constructPath) {
    const coords = ol.argsArray[i][2];
    if (!coords || coords.length !== 4) continue;
    const x0 = coords[0], y0 = coords[1], x1 = coords[2], y1 = coords[3];
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (w > 3 && w < 16 && h > 3 && h < 16) {
      // transform the 4 corners by ctm
      const [px0, py0] = apply(ctm, x0, y0);
      const [px1, py1] = apply(ctm, x1, y1);
      const cx = (px0 + px1) / 2;
      const cyRaw = (py0 + py1) / 2; // in pdfjs page space (y up, origin bottom-left, already in PDF units typically)
      boxes.push({ x: Math.min(px0, px1), y: Math.min(py0, py1), w: Math.abs(px1-px0), h: Math.abs(py1-py0), cx, cy: cyRaw });
    }
  }
}

boxes
  .filter((b) => b.cy >= yMin && b.cy <= yMax)
  .sort((a, b) => b.cy - a.cy || b.cx - a.cx)
  .forEach((b) => console.log(`box center=(${Math.round(b.cx)},${Math.round(b.cy)})  x=${Math.round(b.x)}-${Math.round(b.x + b.w)}  y=${Math.round(b.y)}-${Math.round(b.y + b.h)}`));
console.log(`-- squares found in band: total page squares=${boxes.length}`);
