#!/usr/bin/env node
// One-off generator: converts the OpenTik wordmark to outlined SVG paths so the
// delivered logo files carry no font dependency. Re-run only if the wordmark
// text or weight changes. Requires the source font locally (Windows default).
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FONT = process.env.WORDMARK_FONT ?? "C:/Windows/Fonts/arialbd.ttf";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = join(ROOT, "public", "brand");

const INK = "#18181b";
const BLUE = "#2563eb";
const TRACKING = -3;

function loadFont(file) {
  const buf = readFileSync(file);
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables[buf.toString("ascii", o, o + 4)] = { off: buf.readUInt32BE(o + 8) };
  }
  const head = tables.head.off;
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const longLoca = buf.readInt16BE(head + 50) !== 0;
  const numGlyphs = buf.readUInt16BE(tables.maxp.off + 4);

  const loca = [];
  for (let i = 0; i <= numGlyphs; i++) {
    loca.push(
      longLoca
        ? buf.readUInt32BE(tables.loca.off + i * 4)
        : buf.readUInt16BE(tables.loca.off + i * 2) * 2
    );
  }

  const numHMetrics = buf.readUInt16BE(tables.hhea.off + 34);
  const advance = (gid) => buf.readUInt16BE(tables.hmtx.off + Math.min(gid, numHMetrics - 1) * 4);

  const cmapOff = tables.cmap.off;
  let sub = null;
  for (let i = 0, n = buf.readUInt16BE(cmapOff + 2); i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const off = cmapOff + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(off) === 4) {
      sub = off;
      break;
    }
  }
  if (sub === null) throw new Error("no format-4 cmap in " + file);
  const segX2 = buf.readUInt16BE(sub + 6);
  const seg = segX2 / 2;
  const endO = sub + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;

  const glyphId = (cp) => {
    for (let i = 0; i < seg; i++) {
      if (cp > buf.readUInt16BE(endO + i * 2)) continue;
      const start = buf.readUInt16BE(startO + i * 2);
      if (cp < start) return 0;
      const delta = buf.readInt16BE(deltaO + i * 2);
      const ro = buf.readUInt16BE(rangeO + i * 2);
      if (ro === 0) return (cp + delta) & 0xffff;
      const gi = buf.readUInt16BE(rangeO + i * 2 + ro + (cp - start) * 2);
      return gi === 0 ? 0 : (gi + delta) & 0xffff;
    }
    return 0;
  };

  const contoursOf = (gid) => {
    if (loca[gid] === loca[gid + 1]) return [];
    const off = tables.glyf.off + loca[gid];
    const nContours = buf.readInt16BE(off);
    if (nContours < 0) throw new Error(`composite glyph ${gid} unsupported`);
    const endPts = [];
    for (let i = 0; i < nContours; i++) endPts.push(buf.readUInt16BE(off + 10 + i * 2));
    const nPts = endPts[nContours - 1] + 1;
    let p = off + 10 + nContours * 2;
    p += 2 + buf.readUInt16BE(p);

    const flags = [];
    while (flags.length < nPts) {
      const f = buf.readUInt8(p++);
      flags.push(f);
      if (f & 8) for (let r = buf.readUInt8(p++); r-- > 0; ) flags.push(f);
    }
    const read = (shortBit, sameBit) => {
      const out = [];
      let v = 0;
      for (const f of flags) {
        if (f & shortBit) {
          const d = buf.readUInt8(p++);
          v += f & sameBit ? d : -d;
        } else if (!(f & sameBit)) {
          v += buf.readInt16BE(p);
          p += 2;
        }
        out.push(v);
      }
      return out;
    };
    const xs = read(2, 16);
    const ys = read(4, 32);

    const contours = [];
    let s = 0;
    for (const e of endPts) {
      const pts = [];
      for (let i = s; i <= e; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
      contours.push(pts);
      s = e + 1;
    }
    return contours;
  };

  return { unitsPerEm, glyphId, contoursOf, advance };
}

function contoursToPath(contours, scale, dx, dy) {
  const X = (v) => +(v * scale + dx).toFixed(2);
  const Y = (v) => +(-v * scale + dy).toFixed(2);
  let d = "";
  for (const raw of contours) {
    if (!raw.length) continue;
    const pts = [];
    for (let i = 0; i < raw.length; i++) {
      const cur = raw[i];
      const nxt = raw[(i + 1) % raw.length];
      pts.push(cur);
      if (!cur.on && !nxt.on) pts.push({ x: (cur.x + nxt.x) / 2, y: (cur.y + nxt.y) / 2, on: true });
    }
    const startIdx = pts.findIndex((pt) => pt.on);
    if (startIdx === -1) continue;
    d += `M${X(pts[startIdx].x)} ${Y(pts[startIdx].y)}`;
    for (let k = 1; k <= pts.length; k++) {
      const pt = pts[(startIdx + k) % pts.length];
      if (pt.on) {
        d += `L${X(pt.x)} ${Y(pt.y)}`;
      } else {
        const n = pts[(startIdx + k + 1) % pts.length];
        d += `Q${X(pt.x)} ${Y(pt.y)} ${X(n.x)} ${Y(n.y)}`;
        k++;
      }
    }
    d += "Z";
  }
  return d;
}

function typeset(font, text, size, startX, baselineY) {
  const scale = size / font.unitsPerEm;
  let pen = startX;
  const glyphs = [];
  for (const ch of text) {
    const gid = font.glyphId(ch.codePointAt(0));
    glyphs.push({ ch, d: contoursToPath(font.contoursOf(gid), scale, pen, baselineY) });
    pen += font.advance(gid) * scale + TRACKING;
  }
  return { glyphs, width: pen - startX - TRACKING };
}

// "Open" is ink, "Tik" is blue.
const paint = (glyphs, ink = INK, blue = BLUE) =>
  glyphs
    .map((g, i) => `  <path fill="${i < 4 ? ink : blue}" d="${g.d}"/>`)
    .join("\n");

const ICON = `<path fill="#1d4ed8" stroke="#1d4ed8" stroke-width="28" stroke-linejoin="round" d="M82 166 L186 166 L216 202 L430 202 L430 380 L82 380 Z"/>
    <rect x="150" y="214" width="212" height="170" rx="12" fill="#ffffff"/>
    <rect x="182" y="246" width="148" height="15" rx="7.5" fill="#cbd5e1"/>
    <rect x="182" y="278" width="148" height="15" rx="7.5" fill="#cbd5e1"/>
    <path fill="#2563eb" stroke="#2563eb" stroke-width="28" stroke-linejoin="round" d="M80 306 L442 306 L414 400 L58 400 Z"/>`;

function main() {
  const font = loadFont(FONT);

  // standalone wordmark: cap height 140, baseline 170, 20px side padding
  const wm = typeset(font, "OpenTik", 190, 20, 170);
  const wmW = Math.ceil(wm.width) + 40;
  writeFileSync(
    join(BRAND, "wordmark.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wmW} 220" width="${wmW}" height="220" role="img" aria-label="OpenTik">
${paint(wm.glyphs)}
</svg>
`
  );

  // lockup: 220px icon + 40px gap + wordmark, centered in a 1200x320 canvas
  const SIZE = 150;
  const ICON_BOX = 220;
  const GAP = 44;
  const probe = typeset(font, "OpenTik", SIZE, 0, 0);
  const total = ICON_BOX + GAP + probe.width;
  const left = Math.round((1200 - total) / 2);
  const iconScale = ICON_BOX / 512;
  const text = typeset(font, "OpenTik", SIZE, left + ICON_BOX + GAP, 214);

  const lockup = (ink, blue, iconBlock) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" width="1200" height="320" role="img" aria-label="OpenTik">
  <g transform="translate(${left} 50) scale(${iconScale.toFixed(5)}) translate(0 -18)">
    ${iconBlock}
  </g>
${paint(text.glyphs, ink, blue)}
</svg>
`;

  writeFileSync(join(BRAND, "logo.svg"), lockup(INK, BLUE, ICON));

  // Single-colour icon: the document cannot survive a mono flattening, so the
  // folder reads as open via a real gap between back wall and front panel.
  const mono = (c) =>
    `<path fill="${c}" stroke="${c}" stroke-width="28" stroke-linejoin="round" d="M82 166 L186 166 L216 202 L430 202 L430 292 L82 292 Z"/>
    <path fill="${c}" stroke="${c}" stroke-width="28" stroke-linejoin="round" d="M80 330 L442 330 L414 400 L58 400 Z"/>`;

  writeFileSync(join(BRAND, "logo-mono-black.svg"), lockup("#18181b", "#18181b", mono("#18181b")));
  writeFileSync(join(BRAND, "logo-mono-white.svg"), lockup("#ffffff", "#ffffff", mono("#ffffff")));
  writeFileSync(join(BRAND, "logo-print-bw.svg"), lockup("#000000", "#000000", mono("#000000")));

  console.log(`wordmark + lockups written (font: ${FONT})`);
}

main();
