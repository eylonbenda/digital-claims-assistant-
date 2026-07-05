// Overlay a coordinate grid (vertical lines every step pt, with x labels) onto a PDF page,
// and horizontal lines every step pt with y labels, to help read off exact positions visually.
// Usage: ruler.mjs <src.pdf> <out.pdf> [page0based=0] [step=20]
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const pageIdx = parseInt(process.argv[4] || '0', 10);
const step = parseFloat(process.argv[5] || '20');

const pdf = await PDFDocument.load(fs.readFileSync(SRC));
const font = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.getPages()[pageIdx];
const { width, height } = page.getSize();

const gridColor = rgb(1, 0, 0);
const textColor = rgb(1, 0, 0);

for (let x = 0; x <= width; x += step) {
  page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, thickness: x % 100 === 0 ? 0.8 : 0.3, color: gridColor, opacity: 0.5 });
  // repeat the x label every 100pt of height so it's visible in any cropped band
  for (let yy = 10; yy <= height; yy += 40) {
    page.drawText(String(x), { x: x + 1, y: yy, size: 6, font, color: textColor });
  }
}
for (let y = 0; y <= height; y += step) {
  page.drawLine({ start: { x: 0, y }, end: { x: width, y }, thickness: y % 100 === 0 ? 0.8 : 0.3, color: gridColor, opacity: 0.5 });
  page.drawText(String(y), { x: 2, y: y + 1, size: 6, font, color: textColor });
  page.drawText(String(y), { x: width - 20, y: y + 1, size: 6, font, color: textColor });
}

fs.writeFileSync(OUT, await pdf.save());
console.log('wrote', OUT, width, height);
