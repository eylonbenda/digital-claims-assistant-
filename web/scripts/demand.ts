// Render the demand form with the demo claim — visual QA. Output is git-ignored; render it
// with .pdfwork/render.mjs.  Usage (from web/):  npx tsx scripts/demand.ts
import { buildDemandData } from "../src/lib/demand/data";
import { renderDemandPdf } from "../src/lib/demand/render";
import sample from "../src/lib/formfill/sample-claim";
import { mkdirSync, writeFileSync } from "node:fs";

const out = ".pdfwork-out/demand-sample.pdf";
const doc = buildDemandData({
  data: sample,
  sender: { name: "מוסך לדוגמה", phone: "03-1234567", email: "garage@example.com" },
  addresseeKey: null,
  carAtGarageAt: "2026-11-02",
  now: new Date(),
});
mkdirSync(".pdfwork-out", { recursive: true });
renderDemandPdf(doc).then((bytes) => {
  writeFileSync(out, bytes);
  console.log(`wrote ${out} — ${bytes.length} bytes`);
});
