// Render an arbitrary [xL,xR]x[yTop,yBot] point-rectangle (from page TOP) at a given scale.
// Usage: cropx2.mjs <src> <out> <page1based> <scale> <xL> <xR> <yTop> <yBot>
import * as mupdf from 'mupdf';
import fs from 'fs';

const [,, SRC, OUT, pageArg, scaleArg, xLArg, xRArg, yTopArg, yBotArg] = process.argv;
const pageNum = parseInt(pageArg || '1', 10) - 1;
const scale = parseFloat(scaleArg || '4');
const xL = parseFloat(xLArg);
const xR = parseFloat(xRArg);
const yTop = parseFloat(yTopArg);
const yBot = parseFloat(yBotArg);

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const page = doc.loadPage(pageNum);

const bbox = [
  Math.round(xL * scale),
  Math.round(yTop * scale),
  Math.round(xR * scale),
  Math.round(yBot * scale),
];
const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
pix.clear(255);
const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
page.run(dev, mupdf.Matrix.identity);
dev.close();

fs.writeFileSync(OUT, pix.asPNG());
console.log(`wrote ${OUT} — ${pix.getWidth()}x${pix.getHeight()}`);
