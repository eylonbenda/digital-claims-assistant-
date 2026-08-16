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

test("wordmark.svg is outlined and two-tone", () => {
  const svg = readFileSync(brand("wordmark.svg"), "utf8");
  assert.doesNotMatch(svg, /<text/i, "wordmark must be outlined paths");
  assert.match(svg, /#18181b/i, "Open must be zinc-900");
  assert.match(svg, /#2563eb/i, "Tik must be blue-600");
});

test("logo.svg is a self-contained lockup", () => {
  const svg = readFileSync(brand("logo.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 1200 320"/);
  assert.doesNotMatch(svg, /<image/i, "lockup must inline the icon, not link it");
  assert.doesNotMatch(svg, /<text/i);
  assert.match(svg, /#18181b/i);
});

test("og-image.svg is 1200x630 on stone-50", () => {
  const svg = readFileSync(brand("og-image.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 1200 630"/);
  assert.match(svg, /#fafaf9/i, "background must be stone-50");
});

const MONO = [
  ["logo-mono-black.svg", "#18181b"],
  ["logo-mono-white.svg", "#ffffff"],
  ["logo-print-bw.svg", "#000000"],
];

for (const [file, color] of MONO) {
  test(`${file} is single-color ${color}`, () => {
    const svg = readFileSync(brand(file), "utf8");
    const colors = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,8})"/gi)].map((m) =>
      m[1].toLowerCase()
    );
    assert.ok(colors.length > 0, "no colors found");
    const distinct = new Set(colors);
    assert.equal(distinct.size, 1, `expected one color, got ${[...distinct].join(", ")}`);
    assert.equal([...distinct][0], color);
    assert.match(svg, /viewBox="0 0 1200 320"/);
  });
}
