// CLI: node run.mjs <insurer> <out.pdf>   (insurer = template file name, e.g. hachshara | migdal)
import { fillForm } from './engine.mjs';
import data from './sample-claim.mjs';
import fs from 'fs';

const name = process.argv[2];
const out = process.argv[3];
const template = (await import(`./templates/${name}.mjs`)).default;
fs.writeFileSync(out, await fillForm(template, data));
console.log(`wrote ${out} — insurer="${template.insurer}", ${template.fields.length} fields`);
