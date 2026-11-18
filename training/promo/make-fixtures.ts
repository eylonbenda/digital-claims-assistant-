// Draws the upload files for the promo: illustrated documents and car pictures with no
// "דוגמה" stamp. Documents carry grey bars instead of values, so no frame shows data.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { PROMO_FIXTURE_DIR } from "./fixtures.ts";

const bars = (widths: number[]) => widths.map((w) =>
  `<div style="height:22px;width:${w}%;background:#cbd5e1;border-radius:11px;margin:20px 0"></div>`).join("");

const doc = (title: string, colour: string, photo: boolean, widths: number[]) => `
<div id="card" style="position:relative;width:1000px;height:630px;background:#f8fafc;border-radius:36px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;box-shadow:inset 0 0 0 3px #e2e8f0">
  <div style="background:${colour};color:#fff;font-size:44px;font-weight:800;padding:28px 44px">${title}</div>
  <div style="display:flex;gap:44px;padding:36px 44px">
    ${photo ? `<div style="width:220px;height:280px;border-radius:20px;background:#e2e8f0;position:relative;overflow:hidden;flex:none">
      <div style="position:absolute;left:65px;top:50px;width:90px;height:90px;border-radius:50%;background:#94a3b8"></div>
      <div style="position:absolute;left:25px;top:165px;width:170px;height:170px;border-radius:50%;background:#94a3b8"></div></div>` : ""}
    <div style="flex:1">${bars(widths)}</div>
  </div>
</div>`;

// A car seen from behind in a parking bay, with the damaged area darker and creased.
const car = (body: string, sky: string, zoom: number, shiftX: number, shiftY: number) => `
<div id="card" style="position:relative;width:1200px;height:900px;overflow:hidden;background:${sky}">
 <svg viewBox="0 0 1200 900" width="1200" height="900" style="position:absolute;inset:0;transform:scale(${zoom}) translate(${shiftX}px,${shiftY}px)">
  <rect x="0" y="560" width="1200" height="340" fill="#6b7280"/>
  <rect x="0" y="548" width="1200" height="18" fill="#9ca3af"/>
  <path d="M90 900 L250 600 M1110 900 L950 600" stroke="#e5e7eb" stroke-width="12" opacity=".7"/>
  <ellipse cx="600" cy="742" rx="400" ry="34" fill="#111827" opacity=".35"/>
  <path d="M360 430 Q400 270 600 262 Q800 270 840 430 Z" fill="${body}"/>
  <path d="M410 415 Q440 310 600 302 Q760 310 790 415 Z" fill="#1f2937"/>
  <path d="M430 405 Q455 325 600 318 Q745 325 770 405 Z" fill="#93c5fd" opacity=".55"/>
  <rect x="270" y="415" width="660" height="250" rx="62" fill="${body}"/>
  <rect x="270" y="590" width="660" height="92" rx="38" fill="#1f2937"/>
  <rect x="296" y="462" width="150" height="56" rx="20" fill="#dc2626"/>
  <rect x="754" y="462" width="150" height="56" rx="20" fill="#dc2626"/>
  <rect x="505" y="602" width="190" height="52" rx="8" fill="#facc15"/>
  <rect x="525" y="620" width="150" height="16" rx="8" fill="#a16207" opacity=".55"/>
  <rect x="300" y="668" width="110" height="74" rx="22" fill="#0f172a"/>
  <rect x="790" y="668" width="110" height="74" rx="22" fill="#0f172a"/>
  <path d="M286 520 Q330 500 372 548 Q420 590 400 668 L286 668 Z" fill="#0f172a" opacity=".42"/>
  <path d="M300 470 l52 44 l-40 36 l64 34 l-34 56" fill="none" stroke="#0f172a" stroke-width="9" stroke-linejoin="round" opacity=".8"/>
  <path d="M296 462 h82 l-30 30 l26 26 h-78 Z" fill="#7f1d1d"/>
  <path d="M330 600 l34 22 l-22 30" fill="none" stroke="#e5e7eb" stroke-width="6" opacity=".7"/>
 </svg>
</div>`;

const CARDS: Record<string, string> = {
  "licence-front.png": doc("רישיון נהיגה", "#0f766e", true, [70, 52, 62, 40]),
  "licence-back.png": doc("רישיון נהיגה · צד אחורי", "#0f766e", false, [82, 64, 74, 50, 58]),
  "registration.png": doc("רישיון רכב", "#1d4ed8", false, [58, 78, 46, 70, 62]),
  "car-1.png": car("#e5e7eb", "linear-gradient(#dbeafe,#f1f5f9 62%)", 1, 0, 0),
  "car-2.png": car("#e5e7eb", "linear-gradient(#dbeafe,#f1f5f9 62%)", 2.1, 150, -60),
  "car-3.png": car("#e5e7eb", "linear-gradient(#e0e7ff,#f8fafc 62%)", 1.35, -70, -20),
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
fs.mkdirSync(PROMO_FIXTURE_DIR, { recursive: true });
for (const [name, html] of Object.entries(CARDS)) {
  await page.setContent(`<html dir="rtl"><body style="margin:0;background:#fff">${html}</body></html>`);
  await page.locator("#card").screenshot({ path: path.join(PROMO_FIXTURE_DIR, name) });
  console.log("wrote", name);
}
await browser.close();
