// The three product moments. The screens are drawn here, large enough to read on a phone,
// with the app's own wording and the demo claim's own data; a screenshot of the real app is
// too dense to take in during a two-second shot. The one real picture is the filled form
// itself: the PDF the system produced.
import type { CaptureId } from "../manifest.ts";
import { browserFrame, cropLayer, phoneFrame, region, tap, type Crop } from "./device.ts";
import { BRAND, CANVAS, INK, Sheet, box, copyBlock, esc, fit, layoutFor, type BeatProps, type Layout, type Scene, type VisualKind } from "./layout.ts";

const GREEN = "#16a34a", LINE = "#d9dfe8", MUTED = "#5b667a", FILLED = "#1e3a8a";
const POP = "0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:none}";

type Act = { kind: VisualKind; build: (s: Sheet, l: Layout, p: BeatProps, t0: number, dur: number, brief: boolean) => string };

// A line of text inside a screen. Never smaller than the layout's readable minimum.
const tx = (l: Layout, px: number, text: string, style = "") =>
  `<span data-t style="display:block;font-size:${Math.max(Math.round(px), l.minText)}px;line-height:1.25;${style}">${esc(text)}</span>`;

const tick = (size: number, style = "") =>
  `<span style="flex:none;width:${size}px;height:${size}px;border-radius:50%;background:${GREEN};display:flex;align-items:center;justify-content:center;${style}"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;

const chip = (l: Layout, px: number, text: string, bg: string, fg: string, style = "") =>
  `<span data-t style="flex:none;font-size:${Math.max(Math.round(px), l.minText)}px;line-height:1.2;font-weight:700;white-space:nowrap;background:${bg};color:${fg};border-radius:99px;padding:.32em .8em;${style}">${esc(text)}</span>`;

const label = (s: Sheet, l: Layout, key: string, text: string, t0: number) =>
  `<p class="lb" data-copy="${key}" style="font-size:${l.label}px;${s.rise(t0 + 120, 40, 560)}">${esc(text)}</p>`;

// ── The client's phone ─────────────────────────────────────────────────────────────────
const clientAct: Act = {
  kind: "tall",
  build: (s, l, p, t0, dur, brief) => {
    const f = phoneFrame(l.visual, s.rise(t0, 70, 620));
    const W = f.rect.width * 0.94, px = (k: number) => Math.round(W * k);
    const at = (k: number) => t0 + k * dur;
    const T = brief
      ? { answer: -1, docs: 0, rows: [0.1, 0.22, 0.34], next: 0.5, sent: 0.6 }
      : { answer: 0.13, docs: 0.25, rows: [0.36, 0.47, 0.58], next: 0.71, sent: 0.79 };

    const steps = (active: number) => `<div style="display:flex;gap:${px(0.018)}px;justify-content:center">${["שאלות מהירות", "הפרטים", "סיום"].map((c, i) =>
      chip(l, px(0.05), c, i === active ? BRAND : i < active ? "#dcfce7" : "#eef1f5", i === active ? "#fff" : i < active ? "#15803d" : "#8a94a6", "padding:.3em .55em;")).join("")}</div>`;
    // One step of the form. It slides in from the side the next page comes from, and out the other.
    const screen = (inner: string, inAt?: number, outAt?: number, style = "") => {
      const enter = inAt === undefined ? "" : s.anim("from{opacity:0;transform:translateX(-16%)}to{opacity:1;transform:none}", inAt, 420);
      const exit = outAt === undefined ? "" : s.anim("from{opacity:1;transform:none}to{opacity:0;transform:translateX(16%)}", outAt - 240, 240, "ease-in");
      return `<div style="position:absolute;inset:0;${enter}"><div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:${px(0.045)}px;padding:${px(0.1)}px ${px(0.055)}px ${px(0.07)}px;${style}${exit}">${inner}</div></div>`;
    };
    const chosen = (atMs: number, colour: string, fill: string) =>
      `<div style="position:absolute;inset:-2px;border:3px solid ${colour};background:${fill};border-radius:inherit;${s.fadeIn(atMs, 180)}"></div>`;

    const option = (text: string, pickAt?: number) => `<div style="position:relative;border:2px solid ${LINE};border-radius:${px(0.045)}px;padding:${px(0.052)}px ${px(0.05)}px">
      ${pickAt === undefined ? "" : chosen(pickAt, BRAND, "#eaf1ff")}<div style="position:relative">${tx(l, px(0.064), text, "font-weight:500")}</div>
      ${pickAt === undefined ? "" : tap(s, 0.2, 0.5, pickAt, px(0.16))}</div>`;
    const question = screen(steps(0)
      + tx(l, px(0.085), "יש נפגעים בתאונה?", `font-weight:700;margin-top:${px(0.05)}px`)
      + option("כן, יש נפגעים") + option("לא, אין נפגעים", at(T.answer)), undefined, at(T.docs));

    const row = (text: string, pictures: string[], doneAt: number) => {
      const h = px(0.115), w = px(0.155);
      const thumbs = pictures.map((src, i) => `<img src="${src}" alt="" style="flex:none;width:${w}px;height:${h}px;object-fit:cover;border-radius:${px(0.02)}px;border:2px solid #fff;box-shadow:0 2px 8px rgba(24,36,56,.22);${i ? `margin-inline-start:${-px(0.085)}px;` : ""}${s.anim(POP, doneAt + i * 90, 380)}">`).join("");
      const button = `<div style="position:absolute;inset-inline-end:0;top:50%;margin-top:-.85em;border:2px solid ${BRAND};color:${BRAND};border-radius:${px(0.03)}px;padding:.3em .8em;font-weight:700;white-space:nowrap;font-size:${Math.max(px(0.052), l.minText)}px;line-height:1.1;${s.fadeOut(doneAt - 40, 160)}"><span data-t style="font-size:inherit">צילום</span></div>`;
      return `<div style="position:relative;border:2px solid ${LINE};border-radius:${px(0.04)}px;padding:${px(0.035)}px ${px(0.04)}px">
        ${chosen(doneAt, "#86efac", "#f0fdf4")}
        <div style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:${px(0.02)}px">
          ${tx(l, px(0.062), text, "font-weight:700;white-space:nowrap")}
          <div style="position:relative;display:flex;align-items:center;gap:${px(0.02)}px;min-height:${h}px">${thumbs}${tick(px(0.085), s.anim(POP, doneAt + 240, 380))}${button}${tap(s, 0.22, 0.5, doneAt - 60, px(0.15))}</div>
        </div></div>`;
    };
    const next = `<div style="position:relative;margin-top:auto;background:${BRAND};color:#fff;text-align:center;border-radius:${px(0.04)}px;padding:${px(0.042)}px;${s.anim("0%{transform:none}50%{transform:scale(.96)}100%{transform:none}", at(T.next), 300, "ease-in-out")}">${tx(l, px(0.064), "המשך", "font-weight:700")}${tap(s, 0.5, 0.5, at(T.next), px(0.16))}</div>`;
    const documents = screen(steps(1)
      + tx(l, px(0.08), "מסמכים ותמונות", `font-weight:700;margin-top:${px(0.03)}px`)
      + row("רישיון נהיגה", [p.photos.licenceFront, p.photos.licenceBack], at(T.rows[0]))
      + row("רישיון רכב", [p.photos.registration], at(T.rows[1]))
      + row("תמונות הנזק", p.photos.cars.slice(0, 3), at(T.rows[2]))
      + next, brief ? undefined : at(T.docs), at(T.sent));

    const sent = screen(tick(px(0.26), s.anim(POP, at(T.sent) + 160, 460))
      + tx(l, px(0.08), `הפרטים נשלחו ל${p.copy.businessName}`, "font-weight:700;text-align:center;text-wrap:balance")
      + tx(l, px(0.056), "תודה. נעבור על הפרטים וניצור איתך קשר.", `color:${MUTED};text-align:center;text-wrap:balance`),
      at(T.sent), undefined, "align-items:center;justify-content:center;");

    return copyBlock(l, label(s, l, "client", p.copy.client, t0)) + f.open + (brief ? "" : question) + documents + sent + f.close;
  },
};

// ── The case file, on the business's screen ────────────────────────────────────────────
const caseAct: Act = {
  kind: "wide",
  build: (s, l, p, t0, dur, brief) => {
    const f = browserFrame(l.visual, l.windowAspect, s.rise(t0, 70, 620));
    const W = f.rect.width, px = (k: number) => Math.round(W * k);
    const at = (k: number) => t0 + k * dur;
    const T = brief ? { tiles: 0.08, step: 0.055, count: 0.46, verdict: 0.56 } : { tiles: 0.13, step: 0.065, count: 0.58, verdict: 0.68 };
    const tall = f.aspect < 1, cols = tall ? 2 : 3;

    const files: [string, string][] = [
      [p.photos.licenceFront, "רישיון נהיגה"], [p.photos.licenceBack, "רישיון נהיגה"], [p.photos.registration, "רישיון רכב"],
      ...p.photos.cars.slice(0, 3).map((src): [string, string] => [src, "תמונות הנזק"]),
    ];
    const tile = ([src, text]: [string, string], i: number) => {
      const a = at(T.tiles + i * T.step);
      return `<div style="display:flex;flex-direction:column;gap:${px(0.01)}px;min-height:0;${s.anim("from{opacity:0;transform:translate(70px,36px) scale(.72)}to{opacity:1;transform:none}", a, 520)}">
        <div style="position:relative;flex:1;min-height:0;border-radius:${px(0.014)}px;overflow:hidden;border:1px solid ${LINE};background:#eef1f6"><img src="${src}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block"></div>
        <div style="display:flex;align-items:center;gap:${px(0.01)}px">${tick(px(0.03), s.anim(POP, a + 320, 360))}${tx(l, px(0.027), text, "font-weight:500;white-space:nowrap")}</div></div>`;
    };
    const header = `<div style="display:flex;align-items:center;gap:${px(0.018)}px">
      <span style="flex:none;width:${px(0.075)}px;height:${px(0.075)}px;border-radius:50%;background:#e0e7ff;color:${BRAND};display:flex;align-items:center;justify-content:center;font-weight:700">${tx(l, px(0.038), "י")}</span>
      ${tx(l, px(0.044), "יעל כהן", "font-weight:700;white-space:nowrap")}
      ${chip(l, px(0.026), "הוגש", "#e0e7ff", "#3730a3")}
      <span style="flex:1"></span>
      <span style="display:flex;align-items:center;gap:${px(0.01)}px;${s.anim(POP, at(T.count), 420)}">${tick(px(0.036))}${tx(l, px(0.03), `${files.length} קבצים התקבלו`, "font-weight:700;white-space:nowrap")}</span>
    </div>`;
    const grid = `<div style="flex:1;min-height:0;display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${files.length / cols},minmax(0,1fr));gap:${px(0.022)}px">${files.map(tile).join("")}</div>`;
    // The system's own reading of the claim: the line the business would otherwise work out by phone.
    const verdict = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:${px(0.012)}px ${px(0.016)}px;background:#eef4ff;border:2px solid #c7d7fe;border-radius:${px(0.018)}px;padding:${px(0.02)}px ${px(0.026)}px;${s.rise(at(T.verdict), 36, 560)}">
      ${tx(l, px(0.028), "הצעת המערכת:", `color:${MUTED};white-space:nowrap`)}${tx(l, px(0.032), "צד ג' — דוח פרטי", "font-weight:700;white-space:nowrap")}${chip(l, px(0.025), "ודאות גבוהה", "#dcfce7", "#15803d")}
    </div>`;
    const inner = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:${px(0.026)}px;padding:${px(0.036)}px;background:#f8fafc">${header}${grid}${verdict}</div>`;
    return copyBlock(l, label(s, l, "caseFile", p.copy.caseFile, t0)) + f.open + inner + f.close;
  },
};

// ── The accident notice ────────────────────────────────────────────────────────────────
// Refuses a crop that would put the demo login, or (for a garage) the app's word for agent,
// on screen. The capture stage marks where those are.
function assertClean(p: BeatProps, id: CaptureId, crop: Crop, aspect: number): void {
  const r = region(p.captures[id], crop, aspect);
  for (const a of p.captures[id].avoid ?? []) {
    if (a.what === "agent-word" && p.audience !== "garage") continue;
    if (a.x < r.x + r.w && r.x < a.x + a.w && a.y < r.y + r.h && r.y < a.y + a.h) {
      throw new Error(`the ${id} crop for ${p.ratio} would show the ${a.what} — move the crop in compositions/product.ts`);
    }
  }
}

const FIELDS: [string, string, boolean?][] = [
  ["שם המבוטח", "יעל כהן"], ["מס' רישוי", "12345678"],
  ["תאריך התאונה", "15/11/2026"], ["מקום התאונה", "שדרות ההדגמה 10, חיפה"],
  ["מוקד הנזק", "אחורי"], ["תיאור התאונה", "רכב פגע בי מאחור ברמזור אדום", true],
];
// Starts below the insurer's printed heading and logo.
const PDF_TOP = 0.11;

const formAct: Act = {
  kind: "wide",
  build: (s, l, p, t0, dur, brief) => {
    const aspect = l.ratio === "1x1" ? 1.4 : 0.8, cols = aspect > 1 ? 2 : 1;
    const rect = fit(l.visual, aspect), W = rect.width, px = (k: number) => Math.round(W * k * (cols === 2 ? 0.8 : 1));
    const at = (k: number) => t0 + k * dur;
    const T = brief ? { fields: 0.06, step: 0.06, real: 0.56 } : { fields: 0.13, step: 0.075, real: 0.68 };

    const field = ([name, value, wide]: [string, string, boolean?], i: number) => `<div style="border-bottom:2px solid ${LINE};padding-bottom:${px(0.012)}px;${wide && cols === 2 ? "grid-column:1/-1;" : ""}">
      ${tx(l, px(0.03), name, `color:${MUTED}`)}
      <span data-t style="display:block;font-size:${Math.max(px(0.042), l.minText)}px;line-height:1.3;font-weight:700;color:${FILLED};${s.anim("from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0)}", at(T.fields + i * T.step), 480, "cubic-bezier(.3,0,.3,1)")}">${esc(value)}</span></div>`;
    const sheet = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;gap:${px(0.04)}px;padding:${px(0.07)}px ${px(0.065)}px">
      <span data-t class="lb" style="display:block;font-size:${px(0.066)}px">הודעה על תאונה</span>
      <div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${px(0.034)}px ${px(0.06)}px">${FIELDS.map(field).join("")}</div></div>`;

    // Then the real thing: the insurer's own form, as the system filled it.
    const pdf = p.captures["pdf-page-1"];
    const shown = Math.min(1 - PDF_TOP, pdf.width / aspect / pdf.height);
    const crop: Crop = { cx: 0.5, cy: PDF_TOP + shown / 2, w: 1 };
    assertClean(p, "pdf-page-1", crop, aspect);
    const real = `<div style="position:absolute;inset:0;background:#fff;${s.fadeIn(at(T.real), 520)}">
      <div style="position:absolute;inset:0;transform-origin:70% 20%;${s.anim("from{transform:scale(1)}to{transform:scale(1.07)}", at(T.real), t0 + dur - at(T.real) + 400, "linear")}">${cropLayer(pdf, crop, aspect)}</div>
      <div style="position:absolute;inset-inline:0;bottom:${px(0.05)}px;display:flex;justify-content:center"><span style="display:flex;align-items:center;gap:${px(0.014)}px;background:${INK};color:#fff;border-radius:99px;padding:${px(0.018)}px ${px(0.034)}px;box-shadow:0 10px 30px rgba(24,36,56,.3);${s.anim(POP, at(T.real) + 420, 460)}">${tick(px(0.04))}${tx(l, px(0.032), "על הטופס המקורי של חברת הביטוח", "font-weight:700;white-space:nowrap")}</span></div>
    </div>`;
    const paper = `<div data-frame="paper" style="${box(rect)}background:#fff;border-radius:${Math.round(W * 0.018)}px;overflow:hidden;border-top:${Math.round(W * 0.012)}px solid ${BRAND};box-shadow:0 ${Math.round(W * 0.03)}px ${Math.round(W * 0.08)}px rgba(24,36,56,.2),0 0 0 1px rgba(24,36,56,.08);${s.rise(t0, 70, 620)}">${sheet}${real}</div>`;
    const insurers = !brief && p.insurers.length
      ? `<p class="sm" data-copy="insurers" style="font-size:${l.small}px;color:${MUTED};${s.rise(at(T.real) + 300, 24, 520)}">${esc(p.copy.insurersLead)}: ${p.insurers.map(esc).join(" · ")}</p>`
      : "";
    return copyBlock(l, label(s, l, "form", p.copy.form, t0) + insurers) + paper;
  },
};

function beat(p: BeatProps, s: Sheet, parts: { act: Act; share: number }[], brief: boolean): Scene {
  const T = p.durationMs;
  let t0 = 0;
  const body = parts.map(({ act, share }) => {
    const dur = T * share;
    const l = layoutFor(p.ratio, act.kind);
    const html = `<div style="position:absolute;inset:0;${parts.length > 1 ? s.window(t0, t0 + dur, T, 300) : ""}">${act.build(s, l, p, t0, dur, brief)}</div>`;
    t0 += dur;
    return html;
  }).join("");
  return { body, background: CANVAS };
}

export const client = (p: BeatProps, s: Sheet) => beat(p, s, [{ act: clientAct, share: 1 }], false);
export const caseFile = (p: BeatProps, s: Sheet) => beat(p, s, [{ act: caseAct, share: 1 }], false);
export const form = (p: BeatProps, s: Sheet) => beat(p, s, [{ act: formAct, share: 1 }], false);
// The 15-second cut: the same three moments, one breath each.
export const montage = (p: BeatProps, s: Sheet) => beat(p, s, [
  { act: clientAct, share: 0.33 }, { act: caseAct, share: 0.33 }, { act: formAct, share: 0.34 },
], true);
