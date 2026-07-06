import * as mupdf from "mupdf";
import fs from "fs";
const [,, pdfPath, outPath, page, scale, xL, xR, yTop, yBot] = process.argv;
const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
const pg = doc.loadPage(Number(page));
const s = Number(scale);
const matrix = [s,0,0,-s, -Number(xL)*s, Number(yBot)*s];
// mupdf transform: standard is [s,0,0,s,0,0] with y flipped for top-origin? use pdfwork render approach instead
