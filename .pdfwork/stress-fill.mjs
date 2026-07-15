// Stress-fill: sample claim overridden with real-world-like data (long names,
// long description) to reproduce user-reported issues. Usage:
//   node stress-fill.mjs <insurer> <out.pdf>   (run from .pdfwork, needs web/ deps)
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";

const [insurer, out] = process.argv.slice(2);
const script = `
import { templates, fillForm } from "../src/lib/formfill";
import sample from "../src/lib/formfill/sample-claim";
import { writeFileSync } from "node:fs";
const claim = structuredClone(sample);
claim.insured = { ...claim.insured, first_name: "אילון", last_name: "בן דוד", id_number: "308360734" };
claim.driver = { ...claim.driver, first_name: "אילון", last_name: "בן דוד", id_number: "308360734" };
claim.accident = { ...claim.accident,
  location: "נתיבי איילון",
  description: "מישהו נכנס בי מאחורה בנתיבי איילון יש נזק בחלק האחורי - טמבון, דלת תא מטען ופנס שמאלי אחורי",
};
claim.vehicle = { ...claim.vehicle, manufacturer: "יונדאי", model: "אקסנג", year: "2025", plate: "19510404" };
const tpl = (templates as any)["${insurer}"];
fillForm(tpl, claim).then((bytes) => { writeFileSync("${out.replace(/\\/g, "/")}", bytes); console.log("wrote ${out.replace(/\\/g, "/")}"); });
`;
writeFileSync("../web/scripts/_stress_tmp.ts", script);
const r = spawnSync("npx", ["tsx", "scripts/_stress_tmp.ts"], { cwd: "../web", shell: true, encoding: "utf8" });
console.log(r.stdout, r.stderr);
rmSync("../web/scripts/_stress_tmp.ts");
