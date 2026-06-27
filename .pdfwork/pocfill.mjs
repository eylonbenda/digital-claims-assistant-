// POC: overlay Hebrew text onto a flat insurer PDF (Hachshara) at mapped coordinates.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const FONT_PATH = 'C:/Windows/Fonts/arial.ttf';

const pdf = await PDFDocument.load(fs.readFileSync(SRC));
pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(fs.readFileSync(FONT_PATH), { subset: false });
const pages = pdf.getPages();

const FILL = rgb(0.05, 0.13, 0.55); // blue, stands out from black print
const MARK = rgb(0.75, 0.05, 0.05); // red X for checkboxes

const hasHe = (s) => /[֐-׿]/.test(s);

// Draw a value right-anchored at `right` (RTL Hebrew is reversed for the LTR drawer).
function val(pageIdx, right, y, value, size = 10) {
  // pdf-lib + fontkit shape Hebrew RTL from logical order — do NOT reverse.
  const w = font.widthOfTextAtSize(value, size);
  pages[pageIdx].drawText(value, { x: right - w, y, size, font, color: FILL });
}
// Draw an X mark over a checkbox at (x,y).
function mark(pageIdx, x, y) {
  pages[pageIdx].drawText('X', { x, y, size: 11, font, color: MARK });
}

// ---- Hachshara page 1 field map (demo values) ----
// header
val(0, 505, 708, 'ישראל ישראלי');        // שם הסוכן
val(0, 250, 708, '40123567');             // מס׳ פוליסה
// סוג תביעה — mark "מקיף"
mark(0, 380, 677);
// פרטי המבוטח
val(0, 455, 645, 'דנה');                   // שם פרטי
val(0, 300, 645, 'כהן');                   // שם משפחה
val(0, 200, 645, '302154687');             // מספר תעודת זהות
val(0, 488, 617, 'רחוב הרצל ראשון לציון'); // כתובת
val(0, 455, 590, '054-1234567');           // טלפון נייד
val(0, 175, 590, 'dana@example.com', 9);   // דוא״ל
// פרטי האירוע
val(0, 445, 470, '12-345-67');             // מספר רישוי הרכב המבוטח
val(0, 230, 470, '22/06/2026');            // תאריך האירוע
val(0, 110, 470, '14:30');                 // שעה
val(0, 445, 443, 'צומת אחוזה רעננה');      // מקום האירוע
val(0, 235, 443, 'שמאי אבי לוי');          // השמאי המטפל
// מוסך
val(0, 470, 416, 'מוסך הסדר רעננה');       // שם המוסך
val(0, 300, 416, 'רעננה');                 // כתובת מוסך
val(0, 130, 416, '09-7654321');            // טלפון מוסך
// מי אשם — mark "אני"
mark(0, 446, 256);

fs.writeFileSync(OUT, await pdf.save());
console.log('wrote', OUT);
