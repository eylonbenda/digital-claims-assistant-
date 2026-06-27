import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), isEvalSupported: false }).promise;
const page = await doc.getPage(1);
const yLo = parseFloat(process.argv[3] ?? '505');
const yHi = parseFloat(process.argv[4] ?? '520');
const ol = await page.getOperatorList();
let n = 0;
for (let i = 0; i < ol.fnArray.length; i++) {
  if (ol.fnArray[i] !== OPS.constructPath) continue;
  const a = ol.argsArray[i];
  const coords = a[2]; // Float32Array
  if (!coords) continue;
  let inBand = false;
  for (let k = 1; k < coords.length; k += 2) if (coords[k] >= yLo && coords[k] <= yHi) { inBand = true; break; }
  if (!inBand) continue;
  console.log('op=' + a[0] + '  coords=' + Array.from(coords).map((v) => Math.round(v)).join(','));
  if (++n >= 14) break;
}
console.log('OPS.rectangle=', OPS.rectangle);
