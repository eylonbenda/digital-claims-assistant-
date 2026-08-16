import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

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

test("wordmark mono variants are single-color", () => {
  for (const [file, color] of [
    ["wordmark-mono-black.svg", "#18181b"],
    ["wordmark-mono-white.svg", "#ffffff"],
  ]) {
    const svg = readFileSync(brand(file), "utf8");
    const colors = new Set(
      [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,8})"/gi)].map((m) => m[1].toLowerCase())
    );
    assert.equal(colors.size, 1, `${file}: got ${[...colors].join(", ")}`);
    assert.equal([...colors][0], color);
  }
});

test("wordmark.png is trimmed to its ink on all four edges", async () => {
  // A name-only logo must carry no baked-in padding, so the mark's own bounds
  // are the file's bounds and callers control the surrounding space.
  const src = brand("wordmark-1600.png");
  const before = await sharp(src).metadata();
  const after = await sharp(src).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  assert.equal(after.info.width, before.width, "horizontal slack in the canvas");
  assert.equal(after.info.height, before.height, "vertical slack in the canvas");
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

const RASTERS = [
  ["icon-16.png", 16, 16],
  ["icon-32.png", 32, 32],
  ["apple-touch-icon.png", 180, 180],
  ["icon-192.png", 192, 192],
  ["icon-512.png", 512, 512],
  ["og-image.png", 1200, 630],
];

for (const [file, w, h] of RASTERS) {
  test(`${file} is ${w}x${h}`, async () => {
    const meta = await sharp(brand(file)).metadata();
    assert.equal(meta.width, w);
    assert.equal(meta.height, h);
  });
}

test("logo-400.png and logo-1200.png keep transparency", async () => {
  for (const [file, w] of [["logo-400.png", 400], ["logo-1200.png", 1200]]) {
    const meta = await sharp(brand(file)).metadata();
    assert.equal(meta.width, w);
    assert.ok(meta.hasAlpha, `${file} must have an alpha channel`);
  }
});

test("logo-email.png is 600 wide and opaque white-backed", async () => {
  const meta = await sharp(brand("logo-email.png")).metadata();
  assert.equal(meta.width, 600);
  const { data } = await sharp(brand("logo-email.png")).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[0], 255, "top-left pixel should be white");
});

const AVATARS = [
  ["avatar-whatsapp.png", [0x25, 0x63, 0xeb]],
  ["avatar-whatsapp-wordmark.png", [0xff, 0xff, 0xff]],
];

for (const [file, bg] of AVATARS) {
  test(`${file} is 512x512 and fully opaque`, async () => {
    const meta = await sharp(brand(file)).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.hasAlpha, false, "WhatsApp flattens alpha unpredictably");
  });

  test(`${file} survives a circle crop`, async () => {
    // WhatsApp crops to a circle: every pixel outside the inscribed circle must
    // be plain background, so nothing of the mark is clipped away.
    const { data, info } = await sharp(brand(file)).raw().toBuffer({ resolveWithObject: true });
    const r = info.width / 2;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (Math.hypot(x - r, y - r) <= r) continue;
        const i = (y * info.width + x) * info.channels;
        const off = Math.max(
          Math.abs(data[i] - bg[0]),
          Math.abs(data[i + 1] - bg[1]),
          Math.abs(data[i + 2] - bg[2])
        );
        assert.ok(off <= 8, `mark reaches outside the circle at ${x},${y}`);
      }
    }
  });
}

test("favicon.ico exists with three embedded sizes", () => {
  const ico = readFileSync(join(ROOT, "src", "app", "favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0, "ICO reserved field");
  assert.equal(ico.readUInt16LE(2), 1, "ICO type must be 1");
  assert.equal(ico.readUInt16LE(4), 3, "expected 3 images (16/32/48)");
});
