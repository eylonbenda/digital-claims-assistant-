import { fontFaceCss } from "../fonts.ts";
import type { Composition } from "../renderer.ts";
import { SIZE, type Ratio } from "../timeline.ts";

// Five seconds that prove the pipeline: both fonts, Hebrew, and even motion.
export function spike(ratio: Ratio): Composition {
  const { width, height } = SIZE[ratio];
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
${fontFaceCss()}
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#f6f8fc;color:#182438}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;text-align:center}
h1{font:900 ${Math.round(width * 0.085)}px "Frank Ruhl Libre",serif;margin:0;line-height:1.1;animation:rise 900ms cubic-bezier(.2,.8,.2,1) both}
h1 span{color:#1d4ed8}
p{font:500 ${Math.round(width * 0.036)}px Heebo,sans-serif;margin:0;animation:rise 900ms 500ms cubic-bezier(.2,.8,.2,1) both}
.card{position:absolute;bottom:14%;left:0;width:${Math.round(width * 0.3)}px;height:${Math.round(width * 0.16)}px;border-radius:28px;background:#1d4ed8;animation:slide 5000ms linear both}
@keyframes rise{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes slide{from{transform:translateX(-100%)}to{transform:translateX(${width}px)}}
</style></head><body>
<div class="wrap"><h1>פותחים תיק.<br><span>סוגרים עניין.</span></h1><p>בדיקת רינדור · OpenTik · 052-448-8867</p></div>
<div class="card"></div>
</body></html>`;
  return { html, durationMs: 5000 };
}
