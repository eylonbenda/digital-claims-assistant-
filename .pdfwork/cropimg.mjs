// Crop a PNG by pixel rect. Usage: cropimg.mjs <in> <out> <left> <top> <width> <height>
import sharp from "sharp";
const [,, inPath, outPath, left, top, width, height] = process.argv;
await sharp(inPath)
  .extract({ left: Number(left), top: Number(top), width: Number(width), height: Number(height) })
  .toFile(outPath);
console.log("wrote", outPath);
