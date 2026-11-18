// Browser-side overlay, kept as a plain string: tsx (esbuild keepNames) injects helper
// calls into serialised functions, which do not exist inside the page.
//
// The root hangs off <html>, not <body>, so React hydration never removes it, and it is
// pointer-events:none so it can never swallow a click meant for the app.
// "side" is the caption panel recorded next to a phone clip: large text on the left of
// the frame, where compose leaves room (the phone is overlaid on the right).
export type OverlaySurface = "desktop" | "phone" | "side";
export const SIDE_CAPTION = { left: 70, width: 640 } as const;

export function overlayScript(surface: OverlaySurface): string {
  const phone = surface === "phone";
  const caption = surface === "side"
    ? `position:absolute;top:50%;left:${SIDE_CAPTION.left}px;width:${SIDE_CAPTION.width}px;transform:translateY(-50%);box-sizing:border-box;
      padding:8px 26px 8px 0;border-right:7px solid #1d4ed8;color:#fff;font-size:42px;font-weight:700;line-height:1.4;text-align:right;`
    : `position:absolute;${phone ? "top:10px" : "bottom:26px"};left:50%;transform:translateX(-50%);
      max-width:${phone ? "92%" : "70%"};box-sizing:border-box;padding:${phone ? "9px 14px" : "13px 26px"};border-radius:14px;
      background:rgba(24,36,56,.94);color:#fff;font-size:${phone ? "15px" : "22px"};font-weight:600;line-height:1.35;
      text-align:center;box-shadow:0 8px 28px rgba(24,36,56,.35);`;
  return `(() => {
  if (window.__stage) return;
  const css = \`
    [data-stage-root]{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:var(--font-heebo,"Segoe UI"),"Segoe UI",Arial,sans-serif}
    [data-stage-caption]{${caption}unicode-bidi:plaintext;opacity:0;transition:opacity .25s ease}
    [data-stage-caption][data-on]{opacity:1}
    [data-stage-cursor]{position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(29,78,216,.38);border:2px solid rgba(29,78,216,.95);box-shadow:0 2px 8px rgba(0,0,0,.35);
      transition:transform .55s cubic-bezier(.3,.7,.3,1);opacity:0}
    [data-stage-cursor][data-on]{opacity:1}
    [data-stage-ripple]{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;
      border:3px solid #1d4ed8;animation:stage-ripple .5s ease-out forwards}
    @keyframes stage-ripple{to{transform:scale(3.4);opacity:0}}
    [data-stage-ring]{position:absolute;border:3px solid #1d4ed8;border-radius:12px;
      box-shadow:0 0 0 6px rgba(29,78,216,.22);opacity:0;transition:opacity .2s}
    [data-stage-ring][data-on]{opacity:1}
    [data-stage-title]{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;
      gap:14px;background:#182438;color:#fff;text-align:center;unicode-bidi:plaintext;padding:0 8%}
    [data-stage-title][data-on]{display:flex}
    [data-stage-title] b{font-size:${phone ? "30px" : "54px"};font-weight:700}
    [data-stage-title] i{width:64px;height:5px;border-radius:3px;background:#1d4ed8}
  \`;
  const mk = (attr) => { const d = document.createElement("div"); d.setAttribute(attr, ""); return d; };
  const root = mk("data-stage-root");
  const style = document.createElement("style"); style.textContent = css; root.appendChild(style);
  const ring = mk("data-stage-ring"), cursor = mk("data-stage-cursor"), caption = mk("data-stage-caption"), title = mk("data-stage-title");
  caption.setAttribute("dir", "rtl"); title.setAttribute("dir", "rtl");
  root.append(ring, cursor, caption, title);
  // An init script can run before <html> exists; DOMContentLoaded mounts it then.
  const mount = () => { if (document.documentElement && !root.isConnected) document.documentElement.appendChild(root); };
  mount();
  document.addEventListener("DOMContentLoaded", mount);
  window.__stage = {
    caption(text) { mount(); caption.textContent = text || ""; text ? caption.setAttribute("data-on", "") : caption.removeAttribute("data-on"); },
    cursor(x, y) { mount(); cursor.setAttribute("data-on", ""); cursor.style.transform = "translate(" + x + "px," + y + "px)"; },
    ripple(x, y) { const r = mk("data-stage-ripple"); r.style.left = x + "px"; r.style.top = y + "px"; root.appendChild(r); setTimeout(() => r.remove(), 600); },
    ring(b) { if (!b) { ring.removeAttribute("data-on"); return; }
      ring.style.left = (b.x - 6) + "px"; ring.style.top = (b.y - 6) + "px"; ring.style.width = (b.width + 6) + "px"; ring.style.height = (b.height + 6) + "px";
      ring.setAttribute("data-on", ""); },
    title(text) { mount(); if (!text) { title.removeAttribute("data-on"); return; }
      title.innerHTML = ""; const b = document.createElement("b"); b.textContent = text; title.append(b, document.createElement("i")); title.setAttribute("data-on", ""); },
  };
})();`;
}
