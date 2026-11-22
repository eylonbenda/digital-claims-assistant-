// The three product moments. Every screen here is a capture of the real app: taken in a
// narrow window at a high pixel density, so the app's own text is large in the frame, and
// filmed with a camera that travels down the page to one thing at a time. Nothing inside a
// screen is redrawn; the only things drawn over a capture are a tap, an outline and a pill.
import type { CaptureId } from "../manifest.ts";
import { browserFrame, markOf, phoneFrame, ring, shot, sweep, tapOn, type Hold, type Region, type ShotOpts, type View } from "./device.ts";
import { BRAND, CANVAS, INK, Sheet, box, copyBlock, esc, fit, layoutFor, type BeatProps, type CaptureRef, type Layout, type Scene, type VisualKind } from "./layout.ts";

const GREEN = "#16a34a", MUTED = "#5b667a";
const POP = "0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:none}";
// The smallest text the app shows in these shots (its labels and buttons), and the size of
// the insurer's print on the form, in the units the capture was measured in.
const APP_TEXT = 14, PDF_TEXT = 8;

type Act = { kind: VisualKind; build: (s: Sheet, l: Layout, p: BeatProps, t0: number, dur: number, brief: boolean) => string };

const label = (s: Sheet, l: Layout, key: string, text: string, t0: number) =>
  `<p class="lb" data-copy="${key}" style="font-size:${l.label}px;${s.rise(t0 + 120, 40, 560)}">${esc(text)}</p>`;

// Refuses a shot that would put the demo login, or (for a garage) the word for agent, on
// screen. The capture stage marks where those are.
function assertClean(p: BeatProps, id: CaptureId, r: Region): void {
  for (const a of p.captures[id].avoid ?? []) {
    if (a.what === "agent-word" && p.audience !== "garage") continue;
    if (a.x < r.x + r.w && r.x < a.x + a.w && a.y < r.y + r.h && r.y < a.y + a.h) {
      throw new Error(`the ${id} shot for ${p.ratio} would show the ${a.what} — move the camera in compositions/product.ts`);
    }
  }
}

// One capture on screen, checked for what must not be shown.
function film(s: Sheet, p: BeatProps, id: CaptureId, view: View, holds: Hold[], o: ShotOpts): string {
  assertClean(p, id, sweep(p.captures[id], view, holds, o));
  return shot(s, id, p.captures[id], view, holds, o);
}

// Where the camera must rest for a part of the capture to sit `k` of the way down the view.
const rest = (cap: CaptureRef, view: View, y: number, k: number) => y - (k * view.height) / ((view.width * cap.height) / cap.width);

// ── The client's phone ─────────────────────────────────────────────────────────────────
const clientAct: Act = {
  kind: "tall",
  build: (s, l, p, t0, dur, brief) => {
    const cssWidth = p.captures["client-question"].cssWidth ?? 320;
    // Wide enough for the app's small text to read; it may run off the bottom of the frame.
    const f = phoneFrame(l.visual, s.rise(t0, 70, 620), Math.max(Math.ceil((cssWidth * l.minText) / APP_TEXT / 0.94) + 4, l.visual.width * 0.66), l.height);
    const at = (k: number) => t0 + k * dur, end = t0 + dur, tapSize = Math.round(f.view.width * 0.11);
    const T = brief
      ? { answer: -1, docs: 0, stills: [0, 0.12, 0.3, 0.4], a: 0.18, b: [0.26, 0.46], c: 0.54, next: 0.58, sent: 0.66 }
      : { answer: 0.12, docs: 0.24, stills: [0.24, 0.35, 0.53, 0.61], a: 0.44, b: [0.5, 0.66], c: 0.72, next: 0.76, sent: 0.82 };
    // A step of the form arrives from the side the next page comes from.
    const slide = (inner: string, atMs: number) =>
      `<div style="position:absolute;inset:0;${s.anim("from{opacity:0;transform:translateX(-16%)}to{opacity:1;transform:none}", atMs, 420)}">${inner}</div>`;

    const q = p.captures["client-question"], answer = markOf(q, "client-question", "answer");
    const question = brief ? "" : film(s, p, "client-question", f.view, [{ from: t0, to: end, top: 0 }], {
      px: answer.px, overlay: ring(s, answer, at(T.answer), 2) + tapOn(s, answer, at(T.answer), tapSize),
    });

    // The same step as each document lands. Every still follows the same part of the page,
    // and a still only changes while the camera rests, so a file appears on a page that holds still.
    const parts = ["licence", "registration", "photos"];
    const docs = ([0, 1, 2, 3] as const).map((n) => {
      const id = `client-docs-${n}` as const, cap = p.captures[id];
      const m = (name: string) => markOf(cap, id, name);
      const holds: Hold[] = [
        { from: t0, to: at(T.a), top: rest(cap, f.view, m("licence").y, 0.36) },
        { from: at(T.b[0]), to: at(T.b[1]), top: rest(cap, f.view, m("registration").y, 0.5) }, // a part that stays put as files land below it; low enough that the shortest still is not at its end
        { from: at(T.c), to: end, top: rest(cap, f.view, m("next").y, 0.74) },
      ];
      const overlay = n < 3 ? tapOn(s, m(parts[n]), at(T.stills[n + 1]) - 130, tapSize) : tapOn(s, m("next"), at(T.next), tapSize);
      const still = film(s, p, id, f.view, holds, { px: APP_TEXT, overlay });
      if (n === 0) return brief ? still : slide(still, at(T.docs));
      return `<div style="position:absolute;inset:0;${s.fadeIn(at(T.stills[n]), 150)}">${still}</div>`;
    }).join("");

    const sent = slide(film(s, p, "client-sent", f.view, [{ from: t0, to: end, top: 0 }], { px: 16 }), at(T.sent));
    return copyBlock(l, label(s, l, "client", p.copy.client, t0)) + f.open + question + docs + sent + f.close;
  },
};

// ── The case file, on the business's screen ────────────────────────────────────────────
const caseAct: Act = {
  kind: "wide",
  build: (s, l, p, t0, dur, brief) => {
    const f = browserFrame(l.visual, l.windowAspect, s.rise(t0, 70, 620));
    const at = (k: number) => t0 + k * dur, end = t0 + dur;
    const T = brief
      ? { top: -1, tabs: [0, 0.14], foot: 0.4, verdict: 0.56, ring: 0.68 }
      : { top: 0.2, tabs: [0.3, 0.42], foot: 0.56, verdict: 0.68, ring: 0.78 };

    // The files tab: who the claim is, then everything the client sent, to the last photo.
    const files = p.captures["case-files"], m = (name: string) => markOf(files, "case-files", name);
    const holds: Hold[] = [
      ...(brief ? [] : [{ from: t0, to: at(T.top), top: rest(files, f.view, m("name").y, 0.16) }]),
      { from: at(T.tabs[0]), to: at(T.tabs[1]), top: rest(files, f.view, m("tabs").y, 0.05) },
      { from: at(T.foot), to: end, top: 1 },
    ];
    const first = film(s, p, "case-files", f.view, holds, { px: APP_TEXT });

    // The overview tab: the system's own reading of the claim.
    const over = p.captures["case-overview"], verdict = markOf(over, "case-overview", "verdict");
    const second = film(s, p, "case-overview", f.view, [{ from: t0, to: end, top: rest(over, f.view, verdict.y, 0.2) }], {
      px: APP_TEXT, overlay: ring(s, verdict, at(T.ring), Math.round(f.view.width * 0.014)),
    });
    return copyBlock(l, label(s, l, "caseFile", p.copy.caseFile, t0)) + f.open + first
      + `<div style="position:absolute;inset:0;${s.fadeIn(at(T.verdict), 320)}">${second}</div>` + f.close;
  },
};

// ── The accident notice ────────────────────────────────────────────────────────────────
// The column of the insurer's form the camera reads down: its right half, where the form
// puts the insured, the vehicle, the accident and the other driver.
const PDF_COLUMN = { x: 0.465, w: 0.5 };
// Where it rests: the insured and the driver; the accident; the other party.
const PDF_RESTS = [0.095, 0.385, 0.47];

const formAct: Act = {
  kind: "wide",
  build: (s, l, p, t0, dur, brief) => {
    const at = (k: number) => t0 + k * dur, end = t0 + dur;
    const T = brief
      ? { ring: -1, tap: -1, real: 0, rests: [[0, 0.2], [0.34, 0.5], [0.62, 1]], pill: 0.66 }
      : { ring: 0.08, tap: 0.2, real: 0.3, rests: [[0.3, 0.44], [0.52, 0.66], [0.75, 1]], pill: 0.84 };

    // The form tab of the claim, and the button that fills the form.
    let office = "";
    if (!brief) {
      const f = browserFrame(l.visual, l.windowAspect, s.rise(t0, 70, 620));
      const tab = p.captures["form-tab"], m = (name: string) => markOf(tab, "form-tab", name);
      const pad = Math.round(f.view.width * 0.012);
      office = `<div style="position:absolute;inset:0;${s.fadeOut(at(T.real) + 120, 320)}">${f.open}${film(s, p, "form-tab", f.view,
        [{ from: t0, to: end, top: rest(tab, f.view, m("tabs").y, 0.06) }],
        { px: APP_TEXT, overlay: ring(s, m("filled"), at(T.ring), pad) + tapOn(s, m("generate"), at(T.tap), Math.round(f.view.width * 0.1)) })}${f.close}</div>`;
    }

    // Then the form itself: the insurer's own page, as the system filled it.
    const rect = fit(l.visual, Math.min(1.25, Math.max(0.8, l.visual.width / l.visual.height)));
    const W = rect.width, edge = Math.round(W * 0.012), view = { width: W, height: rect.height - edge };
    const pill = `<div data-overlay style="position:absolute;inset-inline:0;bottom:${Math.round(W * 0.045)}px;display:flex;justify-content:center"><span style="display:flex;align-items:center;gap:${Math.round(W * 0.014)}px;background:${INK};color:#fff;border-radius:99px;padding:${Math.round(W * 0.018)}px ${Math.round(W * 0.034)}px;box-shadow:0 10px 30px rgba(24,36,56,.3);${s.anim(POP, at(T.pill), 460)}">
      <span style="flex:none;width:${Math.round(W * 0.04)}px;height:${Math.round(W * 0.04)}px;border-radius:50%;background:${GREEN};display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <span data-t style="font-size:${Math.max(Math.round(W * 0.032), l.minText)}px;line-height:1.25;font-weight:700;white-space:nowrap">על הטופס המקורי של חברת הביטוח</span></span></div>`;
    const holds: Hold[] = PDF_RESTS.map((top, k) => ({ from: at(T.rests[k][0]), to: at(T.rests[k][1]), top }));
    const paper = `<div data-frame="paper" style="${box(rect)}background:#fff;border-radius:${Math.round(W * 0.018)}px;overflow:hidden;border-top:${edge}px solid ${BRAND};box-shadow:0 ${Math.round(W * 0.03)}px ${Math.round(W * 0.08)}px rgba(24,36,56,.2),0 0 0 1px rgba(24,36,56,.08);${s.rise(at(T.real), 90, 640)}">
      <div style="position:absolute;inset:0">${film(s, p, "pdf-page-1", view, holds, { ...PDF_COLUMN, px: PDF_TEXT })}</div>${pill}</div>`;
    const insurers = !brief && p.insurers.length
      ? `<p class="sm" data-copy="insurers" style="font-size:${l.small}px;color:${MUTED};${s.rise(at(T.real) + 300, 24, 520)}">${esc(p.copy.insurersLead)}: ${p.insurers.map(esc).join(" · ")}</p>`
      : "";
    return copyBlock(l, label(s, l, "form", p.copy.form, t0) + insurers) + office + paper;
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
