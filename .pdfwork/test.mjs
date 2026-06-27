// Controlled test: draw Hebrew words RAW (logical) vs REV (reversed) to see which renders correctly.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(fs.readFileSync('C:/Windows/Fonts/arial.ttf'));
const page = pdf.addPage([520, 320]);
const rev = (s) => [...s].reverse().join('');
const words = ['רעננה', 'טויוטה', 'אבגד', 'שלום']; // known words; correct = first letter on the RIGHT

let y = 280;
for (const wd of words) {
  page.drawText('1_RAW=', { x: 20, y, size: 18, font, color: rgb(0, 0, 0) });
  page.drawText(wd, { x: 120, y, size: 18, font, color: rgb(0, 0, 0.7) });
  page.drawText('2_REV=', { x: 270, y, size: 18, font, color: rgb(0, 0, 0) });
  page.drawText(rev(wd), { x: 370, y, size: 18, font, color: rgb(0.7, 0, 0) });
  y -= 55;
}
fs.writeFileSync(process.argv[2], await pdf.save());
console.log('ok');
