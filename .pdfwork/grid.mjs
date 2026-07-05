// Render a PDF page crop with a ruler grid overlaid (points, every 10pt) for calibration.
import * as mupdf from 'mupdf';
import fs from 'fs';
import { PNG } from 'pngjs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const pageNum = parseInt(process.argv[4] || '1', 10) - 1;
const scale = parseFloat(process.argv[5] || '4');
const yTop = parseFloat(process.argv[6]);
const yBot = parseFloat(process.argv[7]);

const doc = mupdf.Document.openDocument(fs.readFileSync(SRC), 'application/pdf');
const page = doc.loadPage(pageNum);
const b = page.getBounds();
const W = b[2] - b[0];
const H = yBot !== undefined ? yBot - yTop : b[3] - b[1];

const bbox = [0, Math.round((yTop||0) * scale), Math.round(W * scale), Math.round((yBot!==undefined?yBot:b[3]) * scale)];
const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
pix.clear(255);
const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix);
page.run(dev, mupdf.Matrix.identity);
dev.close();

const buf = pix.asPNG();
fs.writeFileSync(OUT, buf);
console.log(`wrote ${OUT} — ${pix.getWidth()}x${pix.getHeight()} pageW=${W} pageH=${b[3]}`);
