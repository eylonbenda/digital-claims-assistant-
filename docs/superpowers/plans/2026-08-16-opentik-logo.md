# OpenTik Logo Brand Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the full OpenTik brand asset kit (open-folder icon + wordmark lockup) as SVG masters plus every raster size/format listed in the spec, and wire the favicons and OG image into the Next app.

**Architecture:** SVG masters are the single source of truth, hand-authored with geometric primitives and outlined letterforms (no font dependency at render time). A Node script under `web/scripts/` rasterizes every PNG from those SVGs with `sharp`, and writes the multi-size `favicon.ico` by hand (ICO container wrapping PNG entries). Assets land in `web/public/brand/`; Next metadata references them.

**Tech Stack:** SVG 1.1, Node 20+ ESM, `sharp` 0.34.5 (already present via Next 16), Next.js App Router metadata API.

## Global Constraints

- Brand colors, exact values: folder front `#2563eb` (blue-600), folder back `#1d4ed8` (blue-700), document white `#ffffff`, document rule lines `#cbd5e1`, wordmark "Open" `#18181b` (zinc-900), wordmark "Tik" `#2563eb`, OG background `#fafaf9` (stone-50).
- Icon canvas is `viewBox="0 0 512 512"`. Lockup canvas is `viewBox="0 0 1200 320"`.
- No `<text>` elements in any delivered SVG — all letterforms are `<path>`/primitive outlines, so rendering never depends on an installed font.
- All PNGs are rasterized from the SVG masters by `web/scripts/build-brand-assets.mjs`. Never hand-edit a PNG.
- All brand files live in `web/public/brand/`, except `web/src/app/favicon.ico` which Next serves from the app root.
- Do not add new npm dependencies. `sharp` is resolved from the existing tree.
- Hebrew tagline for the OG image, exact string: `תיק תביעה מסודר — בלי מרדף אחרי הלקוח`

---

### Task 1: Icon master SVG

**Files:**
- Create: `web/public/brand/icon.svg`
- Create: `web/public/brand/icon-favicon.svg`
- Test: `web/scripts/__tests__/brand-assets.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `web/public/brand/icon.svg` (512×512 open-folder icon, full detail) and `web/public/brand/icon-favicon.svg` (same icon, document rule lines removed for small sizes). Later tasks rasterize both.

- [ ] **Step 1: Write the failing test**

Create `web/scripts/__tests__/brand-assets.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: FAIL — "icon.svg missing".

- [ ] **Step 3: Write the icon master**

Create `web/public/brand/icon.svg`. Geometry: back panel is the rear folder wall with a tab; the document sits in front of it; the front flap tilts ~20° via a rotate transform anchored at the folder's bottom-left hinge.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="OpenTik">
  <!-- back wall + tab -->
  <path fill="#1d4ed8" d="M64 168a28 28 0 0 1 28-28h108l40 44h116a28 28 0 0 1 28 28v52H64z"/>
  <!-- document -->
  <g transform="rotate(-6 256 300)">
    <rect x="150" y="180" width="212" height="196" rx="14" fill="#ffffff"/>
    <rect x="180" y="216" width="152" height="16" rx="8" fill="#cbd5e1"/>
    <rect x="180" y="252" width="152" height="16" rx="8" fill="#cbd5e1"/>
    <rect x="180" y="288" width="104" height="16" rx="8" fill="#cbd5e1"/>
  </g>
  <!-- front flap, hinged open -->
  <g transform="rotate(-20 76 404)">
    <path fill="#2563eb" d="M64 264h384a28 28 0 0 1 28 28v112a28 28 0 0 1-28 28H92a28 28 0 0 1-28-28z"/>
  </g>
</svg>
```

- [ ] **Step 4: Write the favicon variant**

Create `web/public/brand/icon-favicon.svg` — identical geometry with the three `#cbd5e1` rule lines removed and the document simplified to a plain white panel:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="OpenTik">
  <path fill="#1d4ed8" d="M64 168a28 28 0 0 1 28-28h108l40 44h116a28 28 0 0 1 28 28v52H64z"/>
  <g transform="rotate(-6 256 300)">
    <rect x="150" y="180" width="212" height="196" rx="14" fill="#ffffff"/>
  </g>
  <g transform="rotate(-20 76 404)">
    <path fill="#2563eb" d="M64 264h384a28 28 0 0 1 28 28v112a28 28 0 0 1-28 28H92a28 28 0 0 1-28-28z"/>
  </g>
</svg>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: PASS, 2/2.

- [ ] **Step 6: Visually check the icon**

Open `web/public/brand/icon.svg` in the browser preview (`preview_start` with `{url: "file:///C:/Users/eylon/digital-claims-assistant/web/public/brand/icon.svg"}`) and screenshot it. The flap must read as *open* (a visible wedge of white document between flap and back wall) and must not cover the document entirely. If the flap hides the document, reduce the rotate angle magnitude in the flap `<g>` from `-20` toward `-26` (more open) and re-screenshot.

- [ ] **Step 7: Commit**

```bash
git add web/public/brand/icon.svg web/public/brand/icon-favicon.svg web/scripts/__tests__/brand-assets.test.mjs
git commit -m "feat(brand): add OpenTik open-folder icon SVG masters"
```

---

### Task 2: Wordmark and lockup SVGs

**Files:**
- Create: `web/public/brand/wordmark.svg`
- Create: `web/public/brand/logo.svg`
- Modify: `web/scripts/__tests__/brand-assets.test.mjs`

**Interfaces:**
- Consumes: `web/public/brand/icon.svg` from Task 1 (its geometry is inlined into the lockup — do not `<image>`-reference it, the raster pipeline needs a self-contained file).
- Produces: `wordmark.svg` (text only, `viewBox="0 0 760 200"`) and `logo.svg` (icon + wordmark horizontal lockup, `viewBox="0 0 1200 320"`). Tasks 3 and 5 rasterize `logo.svg`.

- [ ] **Step 1: Write the failing test**

Append to `web/scripts/__tests__/brand-assets.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: FAIL — ENOENT on `wordmark.svg`.

- [ ] **Step 3: Author the outlined wordmark**

Create `web/public/brand/wordmark.svg`. Build each glyph from geometric primitives on a 200-unit-tall canvas with a 140-unit cap height, baseline at y=170. Letters are bold geometric sans forms; the `O` and `e` counters use `fill-rule="evenodd"` on a compound path so the hole renders.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 200" width="760" height="200" role="img" aria-label="OpenTik">
  <g fill="#18181b">
    <!-- O -->
    <path fill-rule="evenodd" d="M92 30a62 70 0 1 1 0 140 62 70 0 1 1 0-140zm0 38a24 32 0 1 0 0 64 24 32 0 1 0 0-64z"/>
    <!-- p (descender) -->
    <path fill-rule="evenodd" d="M176 70h34v14a44 44 0 0 1 34-16 52 54 0 0 1 0 106 44 44 0 0 1-34-16v42h-34zm52 30a26 26 0 1 0 0 52 26 26 0 1 0 0-52z"/>
    <!-- e -->
    <path fill-rule="evenodd" d="M368 130h-78a26 26 0 0 0 44 12l28 18a56 56 0 1 1 8-38zm-78-22h46a24 24 0 0 0-46 0z"/>
    <!-- n -->
    <path d="M386 70h34v14a40 40 0 0 1 32-16 44 44 0 0 1 44 46v56h-34v-50a20 20 0 0 0-42 0v50h-34z"/>
  </g>
  <g fill="#2563eb">
    <!-- T -->
    <path d="M540 30h124v34h-45v106h-34V64h-45z"/>
    <!-- i -->
    <path d="M676 70h34v100h-34zm17-56a20 20 0 1 1 0 40 20 20 0 1 1 0-40z"/>
    <!-- k -->
    <path d="M726 20h34v86l34-36h42l-44 46 46 54h-42l-36-44v44h-34z"/>
  </g>
</svg>
```

Note: the `k` extends past x=760. After writing the file, widen the `viewBox` and `width` to `0 0 850 200` / `850` so nothing is clipped, and update the test's expectation if you changed the numbers — the test only asserts colors and absence of `<text>` for the wordmark, so no test edit is needed.

- [ ] **Step 4: Author the lockup**

Create `web/public/brand/logo.svg`: icon geometry from Task 1 scaled to 220×220 and placed at x=40, y=50; wordmark group translated to the right of it and vertically centered.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" width="1200" height="320" role="img" aria-label="OpenTik">
  <g transform="translate(40 50) scale(0.4297)">
    <path fill="#1d4ed8" d="M64 168a28 28 0 0 1 28-28h108l40 44h116a28 28 0 0 1 28 28v52H64z"/>
    <g transform="rotate(-6 256 300)">
      <rect x="150" y="180" width="212" height="196" rx="14" fill="#ffffff"/>
      <rect x="180" y="216" width="152" height="16" rx="8" fill="#cbd5e1"/>
      <rect x="180" y="252" width="152" height="16" rx="8" fill="#cbd5e1"/>
      <rect x="180" y="288" width="104" height="16" rx="8" fill="#cbd5e1"/>
    </g>
    <g transform="rotate(-20 76 404)">
      <path fill="#2563eb" d="M64 264h384a28 28 0 0 1 28 28v112a28 28 0 0 1-28 28H92a28 28 0 0 1-28-28z"/>
    </g>
  </g>
  <g transform="translate(300 60)">
    <!-- paste the two <g> groups from wordmark.svg verbatim here -->
  </g>
</svg>
```

Paste the `#18181b` and `#2563eb` groups from `wordmark.svg` verbatim into the `translate(300 60)` group.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: PASS, 4/4.

- [ ] **Step 6: Visually check the lockup**

Screenshot `web/public/brand/logo.svg` in the browser preview. Check: no glyph is clipped by the canvas edge, letter spacing is even, the icon's optical size matches the cap height of the text (icon should be roughly 1.5× cap height). Adjust the `scale()` and `translate()` values until it reads correctly, then re-screenshot.

- [ ] **Step 7: Commit**

```bash
git add web/public/brand/wordmark.svg web/public/brand/logo.svg web/scripts/__tests__/brand-assets.test.mjs
git commit -m "feat(brand): add outlined OpenTik wordmark and lockup SVGs"
```

---

### Task 3: Monochrome and print variants

**Files:**
- Create: `web/public/brand/logo-mono-black.svg`
- Create: `web/public/brand/logo-mono-white.svg`
- Create: `web/public/brand/logo-print-bw.svg`
- Modify: `web/scripts/__tests__/brand-assets.test.mjs`

**Interfaces:**
- Consumes: `web/public/brand/logo.svg` from Task 2 (same geometry, recolored).
- Produces: three single-color lockup SVGs. Task 5 rasterizes `logo-print-bw.svg`.

- [ ] **Step 1: Write the failing test**

Append to `web/scripts/__tests__/brand-assets.test.mjs`:

```js
const MONO = [
  ["logo-mono-black.svg", "#18181b"],
  ["logo-mono-white.svg", "#ffffff"],
  ["logo-print-bw.svg", "#000000"],
];

for (const [file, color] of MONO) {
  test(`${file} is single-color ${color}`, () => {
    const svg = readFileSync(brand(file), "utf8");
    const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase());
    assert.ok(fills.length > 0, "no fills found");
    const distinct = new Set(fills);
    assert.equal(distinct.size, 1, `expected one color, got ${[...distinct].join(", ")}`);
    assert.equal([...distinct][0], color);
    assert.match(svg, /viewBox="0 0 1200 320"/);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: FAIL — ENOENT on `logo-mono-black.svg`.

- [ ] **Step 3: Create the three variants**

Copy `logo.svg` to each of the three filenames, then in each one replace every `fill="#...."` value with that variant's single color. Because the document panel and the folder collapse to one color, delete the three `#cbd5e1` rule-line rects and the white document `<rect>` from the mono files — otherwise the icon becomes a solid blob. Keep the back wall and flap paths only.

```bash
cd web/public/brand
for f in logo-mono-black logo-mono-white logo-print-bw; do cp logo.svg "$f.svg"; done
```

Then hand-edit each: delete the four `<rect>` elements inside the `rotate(-6 256 300)` group, and set every remaining `fill` to `#18181b`, `#ffffff`, `#000000` respectively.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: PASS, 7/7.

- [ ] **Step 5: Visually check the mono lockups**

Screenshot `logo-mono-black.svg` in the preview. With the document removed, the flap and back wall must still read as an open folder — if the two shapes merge into an unreadable blob, add a `stroke="#fafaf9" stroke-width="10"` separator on the flap path in the mono files only (for `logo-mono-white.svg`, use `stroke="#18181b"`). Re-screenshot to confirm.

- [ ] **Step 6: Commit**

```bash
git add web/public/brand/logo-mono-black.svg web/public/brand/logo-mono-white.svg web/public/brand/logo-print-bw.svg web/scripts/__tests__/brand-assets.test.mjs
git commit -m "feat(brand): add monochrome and print lockup variants"
```

---

### Task 4: OG image SVG

**Files:**
- Create: `web/public/brand/og-image.svg`
- Modify: `web/scripts/__tests__/brand-assets.test.mjs`

**Interfaces:**
- Consumes: `logo.svg` geometry from Task 2.
- Produces: `og-image.svg` at `viewBox="0 0 1200 630"` — the source Task 5 rasterizes to `og-image.png`.

- [ ] **Step 1: Write the failing test**

Append to `web/scripts/__tests__/brand-assets.test.mjs`:

```js
test("og-image.svg is 1200x630 on stone-50", () => {
  const svg = readFileSync(brand("og-image.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 1200 630"/);
  assert.match(svg, /#fafaf9/i, "background must be stone-50");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: FAIL — ENOENT on `og-image.svg`.

- [ ] **Step 3: Write the OG image**

Create `web/public/brand/og-image.svg`: a full-bleed `#fafaf9` rect, the lockup centered slightly above the middle, and the Hebrew tagline below it.

The tagline is Hebrew, so it cannot be an outlined path we hand-author. Render it as a `<text>` element in **this file only** — it is the one asset whose PNG is produced on this machine where the font is available, and the PNG (not the SVG) is what ships to social crawlers. Use `font-family="Segoe UI, Arial, sans-serif"`, `direction="rtl"`, `text-anchor="middle"`, `fill="#52525b"`, `font-size="38"`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#fafaf9"/>
  <g transform="translate(160 190) scale(0.73)">
    <!-- paste the full contents of logo.svg (both the icon <g> and the wordmark <g>) here -->
  </g>
  <text x="600" y="470" direction="rtl" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#52525b">תיק תביעה מסודר — בלי מרדף אחרי הלקוח</text>
</svg>
```

Note: the `no <text>` assertions in earlier tests target specific files by name, so they do not apply here. Do not add a `<text>` assertion for this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: PASS, 8/8.

- [ ] **Step 5: Commit**

```bash
git add web/public/brand/og-image.svg web/scripts/__tests__/brand-assets.test.mjs
git commit -m "feat(brand): add OG image source SVG"
```

---

### Task 5: Raster build script

**Files:**
- Create: `web/scripts/build-brand-assets.mjs`
- Modify: `web/package.json` (add the `brand` script to `"scripts"`)
- Modify: `web/scripts/__tests__/brand-assets.test.mjs`

**Interfaces:**
- Consumes: every SVG from Tasks 1–4.
- Produces: all PNGs listed in the spec plus `web/src/app/favicon.ico`. Exposes `npm run brand` as the regeneration command.

- [ ] **Step 1: Write the failing test**

Append to `web/scripts/__tests__/brand-assets.test.mjs`:

```js
import sharp from "sharp";

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

test("favicon.ico exists with three embedded sizes", () => {
  const ico = readFileSync(join(ROOT, "src", "app", "favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0, "ICO reserved field");
  assert.equal(ico.readUInt16LE(2), 1, "ICO type must be 1");
  assert.equal(ico.readUInt16LE(4), 3, "expected 3 images (16/32/48)");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: FAIL — sharp cannot open `icon-16.png` (missing).

- [ ] **Step 3: Write the build script**

Create `web/scripts/build-brand-assets.mjs`:

```js
#!/usr/bin/env node
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = join(ROOT, "public", "brand");
const b = (f) => join(BRAND, f);

const render = (src, out, opts) =>
  sharp(readFileSync(b(src)), { density: 384 }).resize(opts).png().toFile(b(out));

async function main() {
  // square icons — favicon variant for the small ones, full detail above 48px
  await render("icon-favicon.svg", "icon-16.png", { width: 16, height: 16 });
  await render("icon-favicon.svg", "icon-32.png", { width: 32, height: 32 });
  await render("icon.svg", "apple-touch-icon.png", { width: 180, height: 180 });
  await render("icon.svg", "icon-192.png", { width: 192, height: 192 });
  await render("icon.svg", "icon-512.png", { width: 512, height: 512 });

  // lockups, transparent
  await render("logo.svg", "logo-400.png", { width: 400 });
  await render("logo.svg", "logo-1200.png", { width: 1200 });

  // print, transparent black
  await render("logo-print-bw.svg", "logo-print-bw.png", { width: 1200 });

  // email lockup, flattened onto white
  await sharp(readFileSync(b("logo.svg")), { density: 384 })
    .resize({ width: 600 })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(b("logo-email.png"));

  // social card
  await render("og-image.svg", "og-image.png", { width: 1200, height: 630 });

  await buildIco();
  console.log("brand assets built");
}

// ICO container holding three PNG entries (the PNG-in-ICO form, supported
// by every browser we care about and far simpler than BMP+mask encoding).
async function buildIco() {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(readFileSync(b("icon-favicon.svg")), { density: 384 })
        .resize({ width: s, height: s })
        .png()
        .toBuffer()
    )
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type: icon
  header.writeUInt16LE(sizes.length, 4);

  const dirSize = 16 * sizes.length;
  let offset = 6 + dirSize;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s === 256 ? 0 : s, 0); // width
    e.writeUInt8(s === 256 ? 0 : s, 1); // height
    e.writeUInt8(0, 2);                 // palette
    e.writeUInt8(0, 3);                 // reserved
    e.writeUInt16LE(1, 4);              // color planes
    e.writeUInt16LE(32, 6);             // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });

  const ico = Buffer.concat([header, ...entries, ...pngs]);
  writeFileSync(join(ROOT, "src", "app", "favicon.ico"), ico);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Add the npm script**

In `web/package.json`, add to `"scripts"`:

```json
"brand": "node scripts/build-brand-assets.mjs"
```

- [ ] **Step 5: Run the build**

Run: `cd web && npm run brand`
Expected: prints `brand assets built`, no errors. If sharp reports it cannot parse an SVG, the offending master has malformed path data — fix it in that file and re-run.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd web && node --test scripts/__tests__/brand-assets.test.mjs`
Expected: PASS, all tests.

- [ ] **Step 7: Eyeball the 16px favicon**

Open `web/public/brand/icon-16.png` with the Read tool and look at it. It must still read as an open folder — a blue mass with a visible lighter wedge. If it is mud, thicken the flap or increase the contrast between `#2563eb` and `#1d4ed8` in `icon-favicon.svg` (drop the back wall to `#1e3a8a`), re-run `npm run brand`, and look again.

- [ ] **Step 8: Commit**

```bash
git add web/scripts/build-brand-assets.mjs web/package.json web/public/brand web/src/app/favicon.ico web/scripts/__tests__/brand-assets.test.mjs
git commit -m "feat(brand): rasterize brand assets and generate multi-size favicon"
```

---

### Task 6: Wire icons and OG image into Next metadata

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/page.tsx:14-18` (the landing page `metadata` export)
- Test: manual verification via the browser preview

**Interfaces:**
- Consumes: the PNGs and `favicon.ico` produced in Task 5.
- Produces: served favicon/apple-touch links and an `og:image` meta tag on `/`.

- [ ] **Step 1: Add the icons block to the root layout**

In `web/src/app/layout.tsx`, extend the existing `metadata` export (or add one if absent) with:

```ts
export const metadata: Metadata = {
  // ...keep whatever is already there...
  icons: {
    icon: [
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};
```

`favicon.ico` in `src/app/` is picked up automatically by Next — do not add it to this list.

- [ ] **Step 2: Add the OG image to the landing metadata**

In `web/src/app/page.tsx`, extend the existing `metadata` export (currently `title` + `description` at lines 14–18) with:

```ts
  openGraph: {
    title: "OpenTik — עוזר התביעות הדיגיטלי לסוכני ביטוח",
    description:
      "מ׳עברתי תאונה׳ בוואטסאפ לתיק תביעה מסודר עם טופס הודעה על תאונה ממולא — בלי מרדף אחרי הלקוח.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (Full `npm run build` is slower; run it only if tsc passes and you want end-to-end confirmation.)

- [ ] **Step 4: Verify in the running app**

Start the dev server with `preview_start` using the existing `.claude/launch.json` entry, navigate to `/`, then confirm with `javascript_tool`:

```js
[...document.querySelectorAll('link[rel*="icon"], meta[property="og:image"]')]
  .map(e => e.getAttribute('href') || e.getAttribute('content'))
```

Expected: includes `/brand/icon-32.png`, `/brand/apple-touch-icon.png`, and `/brand/og-image.png`. Then `read_network_requests` for `/brand/` and confirm the icon requests return 200, not 404.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/layout.tsx web/src/app/page.tsx
git commit -m "feat(brand): wire OpenTik favicons and OG image into Next metadata"
```

---

### Task 7: Swap the landing header wordmark for the lockup

**Files:**
- Modify: `web/src/app/page.tsx:146-156` (the `<header>` block)

**Interfaces:**
- Consumes: `web/public/brand/logo.svg` from Task 2.
- Produces: nothing downstream — this is the final task.

- [ ] **Step 1: Replace the text wordmark**

The header currently renders text only:

```tsx
<p className="text-xl font-bold tracking-tight">
  Open<span className="text-blue-600">Tik</span>
</p>
```

Replace it with the lockup image, keeping the accessible name:

```tsx
<Image
  src="/brand/logo.svg"
  alt="OpenTik"
  width={150}
  height={40}
  priority
  className="h-10 w-auto"
/>
```

Add `import Image from "next/image";` at the top of the file if it is not already imported.

- [ ] **Step 2: Verify it renders**

Reload `/` in the preview and screenshot the header. The lockup must sit on the same baseline as the "כניסת סוכנים" button and must not overflow the header height. If it looks oversized, reduce `className` to `h-8 w-auto`.

- [ ] **Step 3: Check the console**

Run `read_console_messages` with `onlyErrors: true`. Expected: no new errors. Next may warn about SVG images with `next/image`; if it errors on SVG, add `dangerouslyAllowSVG: true` under `images` in `web/next.config.ts` — or, simpler, swap the `src` to `/brand/logo-400.png` and keep everything else identical.

- [ ] **Step 4: Verify types still compile**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "feat(brand): use the OpenTik lockup in the landing header"
```
