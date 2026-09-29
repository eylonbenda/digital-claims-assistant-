// Diff two same-size PNGs (blank vs filled) and report bbox of pixels that differ
// (i.e. newly-drawn ink), in PNG pixel coords.
import { PNG } from 'pngjs';
import fs from 'fs';

const a = PNG.sync.read(fs.readFileSync(process.argv[2])); // blank
const b = PNG.sync.read(fs.readFileSync(process.argv[3])); // filled
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let y = 0; y < a.height; y++) {
  for (let x = 0; x < a.width; x++) {
    const idx = (a.width * y + x) << 2;
    const dr = Math.abs(a.data[idx] - b.data[idx]);
    const dg = Math.abs(a.data[idx + 1] - b.data[idx + 1]);
    const db = Math.abs(a.data[idx + 2] - b.data[idx + 2]);
    if (dr + dg + db > 30) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
console.log(`diff bbox: x=${minX}-${maxX} y=${minY}-${maxY} (size ${a.width}x${a.height})`);
