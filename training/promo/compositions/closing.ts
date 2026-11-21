import { BRAND, CANVAS, CTA_GREEN, INK, SOFT_BLUE, Sheet, brandSvg, esc, layoutFor, type BeatProps, type Scene } from "./layout.ts";
import { centred, reveal, sentences } from "./opening.ts";

// The outcome: what this audience's owner gets. Words only, on the dark brand colour.
export function outcome(p: BeatProps, s: Sheet): Scene {
  const l = layoutFor(p.ratio);
  const curtain = `<div style="position:absolute;inset:0;background:${INK};${s.anim("from{transform:translateY(100%)}to{transform:none}", 0, 360, "cubic-bezier(.6,0,.2,1)")}"></div>`;
  const lines = sentences(p.copy.outcome).map((line, i) =>
    `<p class="hl" data-copy="outcome-${i}" style="font-size:${l.headline}px;color:${i === 0 ? "#fff" : SOFT_BLUE};${s.rise(320 + i * 620, 56, 640)}">${esc(line)}</p>`).join("");
  const logoW = Math.round(l.headline * 2.9);
  const logo = `<img data-frame="logo" src="${brandSvg("logo-mono-white.svg")}" alt="" style="width:${logoW}px;display:block;margin-top:${Math.round(l.headline * 0.5)}px;${s.fadeIn(1700, 500)}">`;
  return { body: centred(l, lines + logo, Math.round(l.headline * 0.22)), backdrop: curtain, background: CANVAS, end: INK };
}

const WHATSAPP_GLYPH = `<svg viewBox="0 0 24 24" fill="currentColor" style="display:block;width:1.25em;height:1.25em;flex:none"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35z"/><path d="M12.05 2a9.9 9.9 0 0 0-8.57 14.86L2 22l5.27-1.38A9.9 9.9 0 1 0 12.05 2zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 1 1 6.97 3.86z"/></svg>`;

// The end card: who we are, and the one thing to do next. It settles within a second and
// then holds, so the number can be read and typed.
export function endCard(p: BeatProps, s: Sheet): Scene {
  const l = layoutFor(p.ratio);
  const logoW = Math.round(Math.min(l.safe.width * 0.56, 600));
  const cta = Math.round(l.small * 1.5);
  const tagline = p.copy.tagline.map((line, i) =>
    `<p class="hl" data-copy="tagline-${i}" style="font-size:${l.headline}px;${i === 1 ? `color:${BRAND};` : ""}${s.rise(380 + i * 160, 44, 560)}">${esc(line)}</p>`).join("");
  // The ad cut has no outcome beat, so its end card says who this is for.
  const audienceLine = p.cut === "short"
    ? `<p class="lb" data-copy="outcome" style="font-size:${Math.round(l.label * 0.62)}px;color:#42506a;margin-top:${Math.round(l.small * 0.5)}px;${s.rise(760, 30, 520)}">${esc(p.copy.outcome)}</p>`
    : "";
  const button = `<div data-frame="cta" style="display:flex;align-items:center;gap:${Math.round(cta * 0.45)}px;background:${CTA_GREEN};color:#fff;border-radius:${Math.round(cta * 0.7)}px;padding:${Math.round(cta * 0.62)}px ${Math.round(cta * 1.05)}px;font-size:${cta}px;font-weight:700;margin-top:${Math.round(l.small * 1.3)}px;box-shadow:0 14px 34px rgba(31,170,85,.34);max-width:100%;${s.rise(900, 40, 560)}">
      ${WHATSAPP_GLYPH}<span data-copy="cta" style="line-height:1.2">${esc(p.copy.ctaText)}</span></div>`;
  const phone = `<p class="sm" data-copy="phone" data-ltr dir="ltr" style="font-size:${Math.round(cta * 1.12)}px;font-weight:700;letter-spacing:.02em;${s.rise(1060, 30, 520)}">${esc(p.copy.ctaPhone)}</p>`;
  const body = centred(l, `
    <img data-frame="logo" src="${brandSvg("logo.svg")}" alt="" style="width:${logoW}px;display:block;margin-bottom:${Math.round(l.small * 0.4)}px;${s.rise(200, 40, 560)}">
    ${tagline}${audienceLine}${button}${phone}`, Math.round(l.small * 0.5));
  return { body, backdrop: reveal(s, l, CANVAS, 0, 460), background: INK, end: CANVAS };
}
