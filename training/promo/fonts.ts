import fs from "node:fs";
import path from "node:path";
import { TRAINING_ROOT } from "../src/env.ts";

export const HEADLINE_FONT = "Frank Ruhl Libre";
export const BODY_FONT = "Heebo";
export const REQUIRED_FAMILIES = [HEADLINE_FONT, BODY_FONT];

const RANGE = {
  hebrew: "U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F",
  latin: "U+0000-00FF, U+2000-200B, U+2011-206F, U+2190-21FF, U+2713",
};

const FACES: { family: string; pkg: string; weights: number[] }[] = [
  { family: BODY_FONT, pkg: "heebo", weights: [400, 500, 700] },
  { family: HEADLINE_FONT, pkg: "frank-ruhl-libre", weights: [700, 900] },
];

let cached: string | undefined;

// @font-face rules with the files inlined, so a render never touches the network.
export function fontFaceCss(): string {
  if (cached) return cached;
  const rules: string[] = [];
  for (const f of FACES) {
    for (const weight of f.weights) {
      for (const subset of ["hebrew", "latin"] as const) {
        const file = path.join(TRAINING_ROOT, "node_modules", "@fontsource", f.pkg, "files", `${f.pkg}-${subset}-${weight}-normal.woff2`);
        const b64 = fs.readFileSync(file).toString("base64");
        rules.push(
          `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${weight};` +
          `src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${RANGE[subset]};}`,
        );
      }
    }
  }
  cached = rules.join("\n");
  return cached;
}
