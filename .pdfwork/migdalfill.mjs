// POC fill for Migdal (per-glyph form). Same overlay engine, Migdal page-1 coordinate map.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const pdf = await PDFDocument.load(fs.readFileSync(SRC));
pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(fs.readFileSync('C:/Windows/Fonts/arial.ttf'), { subset: false });
const pages = pdf.getPages();
const FILL = rgb(0.05, 0.13, 0.55);
const MARK = rgb(0.75, 0.05, 0.05);
const hasHe = (s) => /[֐-׿]/.test(s);
function val(pi, right, y, value, size = 10) {
  // pdf-lib + fontkit shape Hebrew RTL from logical order — do NOT reverse.
  const w = font.widthOfTextAtSize(value, size);
  pages[pi].drawText(value, { x: right - w, y, size, font, color: FILL });
}
function mark(pi, x, y) { pages[pi].drawText('X', { x, y, size: 11, font, color: MARK }); }

// ---- Migdal page 1 (value baseline ~13pt below each label) ----
// א. פרטי המבוטח
val(0, 241, 662, 'דנה');           // שם פרטי
val(0, 402, 662, 'כהן');           // שם משפחה
val(0, 536, 662, '302154687');     // מספר זהות
val(0, 142, 662, '01/01/1990');    // תאריך לידה
val(0, 405, 635, 'הרצל');          // כתובת (רחוב)
val(0, 286, 635, '12');            // מספר בית
val(0, 526, 635, 'רעננה');         // יישוב
val(0, 80, 635, '4350000');        // מיקוד
val(0, 112, 605, '0541234567');    // טלפון נייד
val(0, 537, 605, '097654321');     // מספר טלפון
val(0, 284, 605, 'dana@example.com', 8); // כתובת דוא״ל
// ב. פרטי כלי רכב
val(0, 536, 515, '12-345-67');     // מספר רישוי
val(0, 169, 515, 'טויוטה');        // שם יצרן
val(0, 86, 515, '2020');           // שנת יצור
mark(0, 317, 513);                 // סוג הרכב = פרטי (box at x317-325,y513-521 — right of label)
// ג. פרטי הנהג (אותו אדם)
val(0, 536, 440, '302154687');     // מספר זהות
val(0, 418, 440, 'כהן');           // שם משפחה
val(0, 301, 440, 'דנה');           // שם פרטי
// ד. פרטי האירוע
val(0, 558, 335, '22/06/2026');    // תאריך אירוע
val(0, 504, 335, '14:30');         // שעה משוערת
val(0, 181, 335, '2');             // מספר נוסעים
mark(0, 308, 333);                 // סוג הנסיעה = פרטית (box center 312,337)

fs.writeFileSync(OUT, await pdf.save());
console.log('wrote', OUT);
