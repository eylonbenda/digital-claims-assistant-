// Fill an insurer's accident-notice form with the demo claim via the APP engine — for visual QA
// of a coordinate template. Render the output PDF with .pdfwork/render.mjs.
// Usage (from web/):  npx tsx scripts/fill.ts <insurer> [out.pdf]
import { templates, fillForm } from "../src/lib/formfill";
import sample from "../src/lib/formfill/sample-claim";
import { writeFileSync } from "node:fs";

const insurer = process.argv[2] as keyof typeof templates;
const out = process.argv[3] ?? `_${insurer}.pdf`;
const tpl = templates[insurer];
if (!tpl) {
  console.error(`unknown insurer "${insurer}". have: ${Object.keys(templates).join(", ")}`);
  process.exit(1);
}
fillForm(tpl, sample).then((bytes) => {
  writeFileSync(out, bytes);
  console.log(`wrote ${out} — ${bytes.length} bytes, ${tpl.fields.length} fields`);
});
