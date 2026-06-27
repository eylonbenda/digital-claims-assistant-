import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LABELS } from "./labels";

const FILL = rgb(0.05, 0.13, 0.55);
const MARK = rgb(0.75, 0.05, 0.05);

// Blank template PDFs + the Hebrew font live next to this module.
// NOTE: app-hebrew.ttf is currently Windows Arial (dev only). Replace with a bundled
// OFL font (Rubik / Heebo / Noto Sans Hebrew) before deploying — Arial is not
// redistributable and won't exist on a Linux host.
// Path is process.cwd()-relative and bundled via next.config `outputFileTracingIncludes`.
const ASSETS = path.join(process.cwd(), "src", "lib", "formfill", "assets");

export type TextField = { key: string; page?: number; right: number; y: number; size?: number };
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
      const pos = typeof val === "string" ? f.options[val] : undefined;
      if (pos) page.drawText("X", { x: pos[0], y: pos[1], size: f.size ?? 11, font, color: MARK });
      continue;
    }
    const raw = get(data, f.key);
    if (raw == null || raw === "") continue;
    // Enum fields rendered as free text get their Hebrew label (vehicle.type "private" -> "פרטי").
    // Checkbox forms are unaffected — they map the enum key to a box above.
    const s = LABELS[f.key]?.[String(raw)] ?? String(raw);
    const size = f.size ?? 10;
    const w = font.widthOfTextAtSize(s, size);
    // Hebrew drawn in logical order — pdf-lib + fontkit shape RTL. Right-anchored.
    page.drawText(s, { x: f.right - w, y: f.y, size, font, color: FILL });
  }
  return pdf.save();
}
