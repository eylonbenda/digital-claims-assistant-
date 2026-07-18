import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LABELS } from "./labels";

const FILL = rgb(0.05, 0.13, 0.55);
const MARK = rgb(0.75, 0.05, 0.05);

// Blank template PDFs + the Hebrew font live next to this module.
// NOTE: app-hebrew.ttf is Noto Sans Hebrew (OFL 1.1 — license bundled as OFL.txt).
// Path is process.cwd()-relative and bundled via next.config `outputFileTracingIncludes`.
const ASSETS = path.join(process.cwd(), "src", "lib", "formfill", "assets");

export type TextField = {
  key: string;
  page?: number;
  right: number;
  y: number;
  size?: number;
  // Multi-line support for long free text (e.g. accident.description) drawn over a form's
  // ruled lines: `width` = max line width in pt; overflowing text word-wraps onto extra
  // lines, each `lineHeight` pt below the previous (default size+3), up to `maxLines`
  // (default 1 → no wrap). If it still doesn't fit, the font size is stepped down until
  // it does (min 5pt), then the last line is clipped.
  width?: number;
  lineHeight?: number;
  maxLines?: number;
};
export type CheckboxField = {
  key: string;
  type: "checkbox";
  page?: number;
  size?: number;
  options: Record<string, [number, number]>;
};
export type Field = TextField | CheckboxField;
export type Template = { insurer: string; srcFile: string; fields: Field[] };

const get = (obj: unknown, p: string): unknown =>
  p.split(".").reduce<unknown>(
    (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
    obj
  );

// Synthetic ".full_name" key for forms with a single merged name cell: joins the
// parent object's first_name + last_name (e.g. "insured.full_name", "driver.full_name").
const resolve = (obj: unknown, p: string): unknown => {
  if (p.endsWith(".full_name")) {
    const parent = get(obj, p.slice(0, -".full_name".length));
    if (parent && typeof parent === "object") {
      const { first_name, last_name } = parent as { first_name?: string; last_name?: string };
      return [first_name, last_name].filter(Boolean).join(" ") || undefined;
    }
    return undefined;
  }
  return get(obj, p);
};

const isCheckbox = (f: Field): f is CheckboxField => "type" in f && f.type === "checkbox";

export async function fillForm(
  template: Template,
  data: unknown,
  fontFile = "app-hebrew.ttf"
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(readFileSync(path.join(ASSETS, template.srcFile)));
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(path.join(ASSETS, fontFile)), {
    subset: false,
  });
  const pages = pdf.getPages();

  for (const f of template.fields) {
    const page = pages[f.page ?? 0];
    if (isCheckbox(f)) {
      const val = get(data, f.key);
      // Booleans match the "yes"/"no" option keys — for on-form כן/לא boxes driven by
      // boolean canonical fields (police.notified, garage.is_arrangement, …).
      const optKey =
        typeof val === "boolean" ? (val ? "yes" : "no") : typeof val === "string" ? val : undefined;
      const pos = optKey !== undefined ? f.options[optKey] : undefined;
      if (pos) page.drawText("X", { x: pos[0], y: pos[1], size: f.size ?? 11, font, color: MARK });
      continue;
    }
    const raw = resolve(data, f.key);
    if (raw == null || raw === "") continue;
    // Enum fields rendered as free text get their Hebrew label (vehicle.type "private" -> "פרטי").
    // Checkbox forms are unaffected — they map the enum key to a box above.
    // Array indices are normalized out for the vocabulary lookup, so
    // third_parties.0.vehicle_type resolves LABELS["third_parties.vehicle_type"].
    const labelKey = f.key.replace(/\.\d+(?=\.)/g, "");
    const s = (LABELS[f.key] ?? LABELS[labelKey])?.[String(raw)] ?? String(raw);
    let size = f.size ?? 10;
    const maxLines = f.maxLines ?? 1;

    if (f.width && maxLines > 1) {
      // Word-wrap into up to maxLines lines of at most f.width pt, shrinking the font
      // until it fits. Splitting on spaces keeps logical order; each line is drawn
      // right-anchored, so Hebrew reads correctly line by line.
      const wrap = (sz: number): string[] => {
        const lines: string[] = [];
        let line = "";
        for (const word of s.split(/\s+/)) {
          const cand = line ? line + " " + word : word;
          if (line && font.widthOfTextAtSize(cand, sz) > f.width!) {
            lines.push(line);
            line = word;
          } else {
            line = cand;
          }
        }
        if (line) lines.push(line);
        return lines;
      };
      let lines = wrap(size);
      while (lines.length > maxLines && size > 5) {
        size -= 0.5;
        lines = wrap(size);
      }
      lines.slice(0, maxLines).forEach((line, i) => {
        const lw = font.widthOfTextAtSize(line, size);
        page.drawText(line, {
          x: f.right - lw,
          y: f.y - i * (f.lineHeight ?? size + 3),
          size,
          font,
          color: FILL,
        });
      });
      continue;
    }

    const w = font.widthOfTextAtSize(s, size);
    // Hebrew drawn in logical order — pdf-lib + fontkit shape RTL. Right-anchored.
    page.drawText(s, { x: f.right - w, y: f.y, size, font, color: FILL });
  }
  return pdf.save();
}
