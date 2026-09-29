// Scan a PNG for ink (non-white) pixels within a y pixel band, report x pixel range.
// Usage: inkband.mjs <png> <yPxTop> <yPxBot>
import { PNG } from 'pngjs';
import fs from 'fs';

const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const yTop = parseInt(process.argv[3], 10);
const yBot = parseInt(process.argv[4], 10);
let minX = Infinity, maxX = -Infinity;
for (let y = yTop; y < yBot; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (png.width * y + x) << 2;
    const r = png.data[idx], g = png.data[idx + 1], b = png.data[idx + 2];
    if (r < 200 || g < 200 || b < 200) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
}
console.log(`ink x range: ${minX} - ${maxX} (png width ${png.width})`);
