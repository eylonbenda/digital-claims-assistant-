// Generic form-fill engine: (template + canonical data) -> filled PDF bytes.
// Template-driven; no per-insurer code. Hebrew drawn in logical order (pdf-lib shapes RTL).
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import { LABELS } from './labels.mjs';

const FILL = rgb(0.05, 0.13, 0.55);
const MARK = rgb(0.75, 0.05, 0.05);
const DEFAULT_FONT = 'C:/Windows/Fonts/arial.ttf';

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export async function fillForm(template, data, fontPath = DEFAULT_FONT) {
  const pdf = await PDFDocument.load(fs.readFileSync(template.src));
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fs.readFileSync(fontPath), { subset: false });
  const pages = pdf.getPages();
  const missing = [];

  for (const f of template.fields) {
    const page = pages[f.page || 0];

    if (f.type === 'checkbox') {
      const val = get(data, f.key);
      const pos = val != null ? f.options?.[val] : undefined;
      if (pos) page.drawText('X', { x: pos[0], y: pos[1], size: f.size || 11, font, color: MARK });
      else if (val != null) missing.push(`${f.key}=${val} (no box mapped)`);
      continue;
    }

    const raw = get(data, f.key);
    if (raw == null || raw === '') continue;
    // Enum fields rendered as free text get their Hebrew label (e.g. vehicle.type "private" -> "פרטי").
    // Checkbox forms are unaffected — they map the enum key to a box above.
    const s = String(LABELS[f.key]?.[raw] ?? raw);
    const size = f.size || 10;
    const w = font.widthOfTextAtSize(s, size);
    // right-anchored; if it would overflow the field's left, the caller can lower `size`.
    page.drawText(s, { x: f.right - w, y: f.y, size, font, color: FILL });
  }

  if (missing.length) console.warn(`[${template.insurer}] unmapped checkbox values:`, missing);
  return await pdf.save();
}
