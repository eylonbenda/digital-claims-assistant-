// The documents the "client" uploads, made to look like a phone photo of the real thing and
// carrying the demo claim's fictional details. They have no state emblem and a silhouette
// for a face: a prop for the video, not a copy of an official document.
import { demoClaim as d } from "../src/demo.ts";

const name = `${d.insured.first_name} ${d.insured.last_name}`;
const address = `${d.accident.street}, ${d.insured.city}`;
const plate = d.vehicle.plate.replace(/^(\d{3})(\d{2})(\d{3})$/, "$1-$2-$3");

// The scene: the document lying on a table, slightly turned, lit from one side.
const photo = (table: string, turn: number, inner: string) => `
<div id="card" style="position:relative;width:1200px;height:900px;overflow:hidden;background:${table};font-family:'Segoe UI',Arial,sans-serif">
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${turn}deg)">${inner}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.16),rgba(0,0,0,0) 45%,rgba(0,0,0,.2))"></div>
</div>`;
const WOOD = "repeating-linear-gradient(94deg,#8a6a4b 0 38px,#7f6144 38px 41px,#8d6d4e 41px 97px,#7a5c40 97px 100px)";
const DESK = "linear-gradient(160deg,#d9d4cc,#bdb7ad)";

const field = (n: string, label: string, value: string, size = 27) => `
  <div style="display:flex;gap:10px;align-items:baseline;margin:7px 0"><b style="font-size:17px;color:#5b6b8c;width:34px">${n}</b>
  <span style="font-size:15px;color:#5b6b8c;width:118px">${label}</span><span style="font-size:${size}px;font-weight:600;color:#16213a">${value}</span></div>`;
const CARD = "width:860px;height:542px;border-radius:30px;overflow:hidden;position:relative;box-shadow:0 26px 50px rgba(0,0,0,.45);background:linear-gradient(135deg,#e9e4f4,#d8e6f3 55%,#efe3ea)";
const PATTERN = `<div style="position:absolute;inset:0;opacity:.35;background:repeating-radial-gradient(circle at 78% 40%,transparent 0 13px,#a9b9d8 13px 14px)"></div>`;

export const licenceFront = photo(WOOD, -3.5, `<div style="${CARD}">${PATTERN}
  <div style="position:relative;display:flex;justify-content:space-between;align-items:center;background:#274b8f;color:#fff;padding:14px 30px">
    <b style="font-size:30px">רישיון נהיגה</b><span dir="ltr" style="font-size:19px;letter-spacing:2px">DRIVING LICENCE</span></div>
  <div style="position:relative;display:flex;gap:30px;padding:18px 30px">
    <div style="flex:1">
      ${field("1.", "שם משפחה", d.insured.last_name)}${field("2.", "שם פרטי", d.insured.first_name)}
      ${field("3.", "תאריך לידה", "14.03.1988")}${field("4a.", "תאריך הנפקה", "02.05.2022")}
      ${field("4b.", "בתוקף עד", "14.03.2032")}${field("4d.", "מספר זהות", d.insured.id_number)}
      ${field("5.", "מספר רישיון", "7001234")}${field("8.", "מען", address, 21)}
      ${field("9.", "דרגות", "B")}
    </div>
    <div style="width:210px;flex:none">
      <div style="width:210px;height:262px;border-radius:12px;background:#c9d2e2;position:relative;overflow:hidden;box-shadow:inset 0 0 0 2px #9aa8c4">
        <div style="position:absolute;left:62px;top:44px;width:86px;height:92px;border-radius:50%;background:#8492ad"></div>
        <div style="position:absolute;left:20px;top:156px;width:170px;height:190px;border-radius:50%;background:#8492ad"></div></div>
      <div dir="ltr" style="margin-top:14px;font-family:'Segoe Script','Brush Script MT',cursive;font-size:30px;color:#1c2a55;text-align:center;transform:rotate(-4deg)">Yael C.</div>
    </div>
  </div></div>`);

const row = (cat: string, from: string, to: string) =>
  `<tr style="border-bottom:1.5px solid #9aa8c4;height:48px"><td style="font-weight:700;font-size:24px">${cat}</td><td>${from}</td><td>${to}</td><td></td></tr>`;
export const licenceBack = photo(WOOD, 2.5, `<div style="${CARD}">${PATTERN}
  <div style="position:relative;padding:26px 30px">
    <table style="width:100%;border-collapse:collapse;font-size:19px;color:#16213a;text-align:center;background:rgba(255,255,255,.35)">
      <tr style="background:#274b8f;color:#fff;font-size:16px;height:40px"><th>9. דרגה</th><th>10. מתאריך</th><th>11. עד תאריך</th><th>12. הגבלות</th></tr>
      ${row("A2", "", "")}${row("A1", "", "")}${row("B", "11.07.2006", "14.03.2032")}${row("C1", "", "")}${row("D1", "", "")}
    </table>
    <div style="margin-top:20px;font-size:15px;color:#3b4a6b;line-height:1.5">הרישיון תקף בצירוף אישור תשלום האגרה. יש לשאת את הרישיון בעת הנהיגה.</div>
    <div style="margin-top:16px;height:70px;width:62%;opacity:.85;background:repeating-linear-gradient(90deg,#16213a 0 3px,transparent 3px 7px,#16213a 7px 9px,transparent 9px 15px,#16213a 15px 20px,transparent 20px 23px)"></div>
  </div></div>`);

const cell = (label: string, value: string) =>
  `<div style="border:1.5px solid #6b7280;margin:-.75px;padding:7px 12px"><div style="font-size:13px;color:#4b5563">${label}</div><div style="font-size:23px;font-weight:600;color:#111827;min-height:30px">${value}</div></div>`;
const grid = (cols: string, cells: string) => `<div style="display:grid;grid-template-columns:${cols};margin-top:12px">${cells}</div>`;
export const registration = photo(DESK, 1.8, `<div style="width:980px;height:640px;background:#fbfaf6;box-shadow:0 22px 44px rgba(0,0,0,.35);padding:30px 38px;position:relative">
  <div style="position:absolute;left:50%;top:0;bottom:0;width:2px;background:linear-gradient(90deg,rgba(0,0,0,.08),rgba(255,255,255,.5))"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111827;padding-bottom:10px">
    <div><div style="font-size:16px;color:#374151">משרד התחבורה והבטיחות בדרכים · אגף הרישוי</div><b style="font-size:38px;color:#111827">רישיון רכב</b></div>
    <div dir="ltr" style="border:3px solid #111827;border-radius:8px;padding:6px 18px;font-size:34px;font-weight:800;letter-spacing:2px;background:#fde047">${plate}</div></div>
  ${grid("repeat(4,1fr)", cell("תוצר", d.vehicle.manufacturer) + cell("כינוי מסחרי", d.vehicle.model) + cell("שנת ייצור", d.vehicle.year) + cell("צבע", d.vehicle.color)
    + cell("סוג הרכב", "פרטי נוסעים") + cell("סוג דלק", "חשמל") + cell("נפח מנוע", "—") + cell("מספר מושבים", "5"))}
  ${grid("2fr 1fr 1fr", cell("שם בעל הרכב", name) + cell("מספר זהות", d.insured.id_number) + cell("בעלות", "פרטית"))}
  ${grid("2fr 1fr 1fr", cell("מען", address) + cell("תוקף הרישיון עד", "30.04.2027") + cell("מועד עלייה לכביש", "05/2024"))}
  ${grid("2fr 1fr 1fr", cell("מספר שילדה", "DEMO0000000000018") + cell("רמת גימור", "LONG RANGE") + cell("אגרה", "שולמה"))}
  <div style="margin-top:16px;font-size:13px;color:#4b5563">רישיון זה תקף רק בצירוף אישור תשלום. יש להחזיקו ברכב בעת הנסיעה.</div>
</div>`);
