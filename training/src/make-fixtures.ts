// Generates the fictional documents the "client" uploads on camera. They are screenshots
// of small HTML cards, so no image library is needed. Every value comes from demoClaim.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { demoClaim as d } from "./demo.ts";
import { FIXTURES } from "./fixtures.ts";

const STAMP = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
  <span style="font-size:110px;font-weight:900;color:rgba(220,38,38,.42);border:10px solid rgba(220,38,38,.42);padding:0 36px;border-radius:24px;transform:rotate(-18deg)">דוגמה</span></div>`;

const page = (w: number, h: number, bg: string, body: string) => `<html dir="rtl"><body style="margin:0">
<div id="card" style="position:relative;width:${w}px;height:${h}px;background:${bg};font-family:'Segoe UI',Arial,sans-serif;overflow:hidden">${body}${STAMP}</div></body></html>`;

const row = (k: string, v: string) => `<div style="display:flex;gap:14px;font-size:26px;margin:10px 0"><b style="color:#475569;min-width:190px">${k}</b><span>${v}</span></div>`;
const name = `${d.insured.first_name} ${d.insured.last_name}`;

const doc = (title: string, colour: string, rows: string) =>
  page(900, 560, "#f8fafc", `<div style="background:${colour};color:#fff;font-size:34px;font-weight:800;padding:20px 32px">${title}</div>
   <div style="padding:26px 32px">${rows}</div>`);

const car = (label: string, dent: string) =>
  page(900, 600, "linear-gradient(#bfdbfe 0 58%,#94a3b8 58%)", `
  <svg viewBox="0 0 900 600" width="900" height="600" style="position:absolute;inset:0">
    <rect x="170" y="250" width="560" height="170" rx="46" fill="#f1f5f9" stroke="#334155" stroke-width="6"/>
    <path d="M270 250 Q330 150 450 150 Q570 150 630 250 Z" fill="#e2e8f0" stroke="#334155" stroke-width="6"/>
    <rect x="320" y="180" width="260" height="62" rx="14" fill="#7dd3fc" stroke="#334155" stroke-width="4"/>
    <rect x="200" y="290" width="90" height="34" rx="8" fill="#ef4444"/><rect x="610" y="290" width="90" height="34" rx="8" fill="#ef4444"/>
    <rect x="380" y="350" width="140" height="40" rx="6" fill="#fde047" stroke="#334155" stroke-width="3"/>
    <text x="450" y="379" text-anchor="middle" font-size="26" font-weight="700" font-family="Arial">${d.vehicle.plate}</text>
    <circle cx="270" cy="430" r="46" fill="#1e293b"/><circle cx="630" cy="430" r="46" fill="#1e293b"/>
    ${dent}
  </svg>
  <div style="position:absolute;top:18px;right:24px;font-size:28px;font-weight:700;color:#1e293b">${label}</div>`);

const dentRear = `<path d="M330 300 l40 26 l-30 22 l46 20 l-22 30" fill="none" stroke="#0f172a" stroke-width="7"/><ellipse cx="350" cy="345" rx="70" ry="48" fill="rgba(15,23,42,.18)"/>`;
const dentSide = `<path d="M560 300 l-34 30 l36 18 l-40 28" fill="none" stroke="#0f172a" stroke-width="7"/><ellipse cx="545" cy="345" rx="60" ry="44" fill="rgba(15,23,42,.18)"/>`;

const CARDS: Record<keyof typeof FIXTURES, string> = {
  licenceFront: doc("רישיון נהיגה — צד קדמי", "#0f766e", row("שם", name) + row("מספר זהות", d.insured.id_number) + row("דרגה", "B") + row("בתוקף עד", "01/01/2031")),
  licenceBack: doc("רישיון נהיגה — צד אחורי", "#0f766e", row("כתובת", `${d.accident.street}, ${d.insured.city}`) + row("הגבלות", "אין") + row("הונפק", "01/01/2021")),
  registration: doc("רישיון רכב", "#1d4ed8", row("מספר רכב", d.vehicle.plate) + row("תוצר ודגם", `${d.vehicle.manufacturer} ${d.vehicle.model}`) + row("שנת ייצור", d.vehicle.year) + row("צבע", d.vehicle.color) + row("בעלים", name)),
  car1: car("תמונת נזק 1 — מאחור", dentRear),
  car2: car("תמונת נזק 2 — תקריב", dentRear + dentSide),
  car3: car("תמונת נזק 3 — מבט כללי", dentSide),
  noClaim: doc("אישור אי-הגשת תביעה", "#7c3aed", row("מבוטח/ת", name) + row("מספר רכב", d.vehicle.plate) + row("חברת הביטוח", d.policyInsurerLabel) + row("תאריך האירוע", "15/11/2026") + row("אישור", "לא הוגשה תביעה בגין האירוע")),
  appraiserReport: doc("דוח שמאי", "#b45309", row("רכב", `${d.vehicle.manufacturer} ${d.vehicle.model} · ${d.vehicle.plate}`) + row("עלות תיקון", "8,200 ₪ לפני מע״מ") + row("ירידת ערך", "2,500 ₪") + row("שכר טרחת שמאי", "900 ₪ לפני מע״מ") + row("שמאי", "שמאות הדגמה")),
  repairInvoice: doc("חשבונית תיקון", "#be123c", row("מוסך", "מוסך הדגמה") + row("לקוח/ה", name) + row("מספר רכב", d.vehicle.plate) + row("תיקון הרכב", "8,200 ₪") + row("מע״מ 18%", "1,476 ₪") + row("סה״כ", "9,676 ₪")),
  paymentNotice: doc("הודעת תשלום", "#15803d", row("חברת הביטוח", d.thirdParty.insurerLabel) + row("לכבוד", name) + row("בגין", "נזקי רכוש — אירוע מיום 15/11/2026") + row("סכום ששולם", "13,238 ₪")),
};

const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
for (const [key, html] of Object.entries(CARDS) as [keyof typeof FIXTURES, string][]) {
  await p.setContent(html);
  fs.mkdirSync(path.dirname(FIXTURES[key]), { recursive: true });
  await p.locator("#card").screenshot({ path: FIXTURES[key] });
  console.log("wrote", path.basename(FIXTURES[key]));
}
await browser.close();
