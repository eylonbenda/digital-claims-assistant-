import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const file = process.argv[2];
const outFile = process.argv[3];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;

let out = `FILE: ${file}\nPAGES: ${doc.numPages}\n`;
let totalChars = 0;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const rows = {};
  for (const it of content.items) {
    if (!it.str || !it.str.trim()) continue;
    totalChars += it.str.trim().length;
    const yKey = Math.round(it.transform[5] / 3) * 3; // bucket lines
    const x = it.transform[4];
    (rows[yKey] ||= []).push({ x, s: it.str });
  }
  const ys = Object.keys(rows).map(Number).sort((a, b) => b - a); // top -> bottom
  out += `\n===== PAGE ${p} =====\n`;
  for (const y of ys) {
    const line = rows[y].sort((a, b) => b.x - a.x).map(o => o.s).join(' '); // RTL: x desc
    out += line.replace(/\s+/g, ' ').trim() + '\n';
  }
}

out = `EXTRACTED_TEXT_CHARS: ${totalChars}\n` + out;
fs.writeFileSync(outFile, out, 'utf8');
console.log(`done -> ${outFile} (chars=${totalChars}, pages=${doc.numPages})`);
