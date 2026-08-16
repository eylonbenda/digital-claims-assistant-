#!/usr/bin/env node
// Rasterizes every brand PNG from the SVG masters in public/brand, and writes
// the multi-size favicon.ico into src/app. Never hand-edit the generated PNGs.
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
  // square icons — the simplified variant below 48px, full detail above
  await render("icon-favicon.svg", "icon-16.png", { width: 16, height: 16 });
  await render("icon-favicon.svg", "icon-32.png", { width: 32, height: 32 });
  await render("icon.svg", "apple-touch-icon.png", { width: 180, height: 180 });
  await render("icon.svg", "icon-192.png", { width: 192, height: 192 });
  await render("icon.svg", "icon-512.png", { width: 512, height: 512 });

  // lockups, transparent
  await render("logo.svg", "logo-400.png", { width: 400 });
  await render("logo.svg", "logo-1200.png", { width: 1200 });

  // name-only wordmark, transparent
  await render("wordmark.svg", "wordmark-400.png", { width: 400 });
  await render("wordmark.svg", "wordmark-800.png", { width: 800 });
  await render("wordmark.svg", "wordmark-1600.png", { width: 1600 });
  await render("wordmark-mono-black.svg", "wordmark-mono-black.png", { width: 1600 });
  await render("wordmark-mono-white.svg", "wordmark-mono-white.png", { width: 1600 });

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

  // WhatsApp Business profile picture — square, circle-crop safe, and strictly
  // opaque: WhatsApp flattens an alpha channel unpredictably (often to black).
  for (const [src, out, bg] of [
    ["avatar-whatsapp.svg", "avatar-whatsapp.png", "#2563eb"],
    ["avatar-whatsapp-wordmark.svg", "avatar-whatsapp-wordmark.png", "#ffffff"],
  ]) {
    await sharp(readFileSync(b(src)), { density: 384 })
      .resize({ width: 512, height: 512 })
      .flatten({ background: bg })
      .png({ palette: false })
      .toFile(b(out));
  }

  await buildIco();
  console.log("brand assets built");
}

// ICO container holding three PNG entries (the PNG-in-ICO form, supported by
// every browser we care about and far simpler than BMP+mask encoding).
async function buildIco() {
  const sizes = [16, 32, 48];
  const src = readFileSync(b("icon-favicon.svg"));
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(src, { density: 384 }).resize({ width: s, height: s }).png().toBuffer()
    )
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s === 256 ? 0 : s, 0); // width
    e.writeUInt8(s === 256 ? 0 : s, 1); // height
    e.writeUInt8(0, 2); // palette count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });

  writeFileSync(join(ROOT, "src", "app", "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
