import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const brand = (f) => join(ROOT, "public", "brand", f);

test("icon.svg exists with the 512 canvas and brand colors", () => {
  assert.ok(existsSync(brand("icon.svg")), "icon.svg missing");
  const svg = readFileSync(brand("icon.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 512 512"/);
  assert.match(svg, /#2563eb/i);
  assert.match(svg, /#1d4ed8/i);
  assert.doesNotMatch(svg, /<text/i, "SVG must not depend on fonts");
});

test("icon-favicon.svg drops the document rule lines", () => {
  assert.ok(existsSync(brand("icon-favicon.svg")), "icon-favicon.svg missing");
  const svg = readFileSync(brand("icon-favicon.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 512 512"/);
  assert.doesNotMatch(svg, /#cbd5e1/i, "rule lines must be absent at favicon size");
});
