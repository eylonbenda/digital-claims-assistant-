// Render a PDF page crop (x and y band) to PNG using mupdf.
// Usage: rendercrop.mjs <src> <out> <page1based> <scale> <xLeft> <xRight> <yTop> <yBot>
import * as mupdf from 'mupdf';
import fs from 'fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const pageNum = parseInt(process.argv[4] || '1', 10) - 1;
const scale = parseFloat(process.argv[5] || '2');
const xLeft = parseFloat(process.argv[6]);
const xRight = parseFloat(process.argv[7]);
const yTop = parseFloat(process.argv[8]);
const yBot = parseFloat(process.argv[9]);

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const page = doc.loadPage(pageNum);

const bbox = [Math.round(xLeft * scale), Math.round(yTop * scale), Math.round(xRight * scale), Math.round(yBot * scale)];
const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
pix.clear(255);
const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
page.run(dev, mupdf.Matrix.identity);
dev.close();

fs.writeFileSync(OUT, pix.asPNG());
console.log(`wrote ${OUT} — ${pix.getWidth()}x${pix.getHeight()}`);
