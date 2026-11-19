import { beatsFor, type BeatId } from "../beats.ts";
import type { Composition } from "../renderer.ts";
import { endCard, outcome } from "./closing.ts";
import { Sheet, layoutFor, page, type BeatProps, type Scene } from "./layout.ts";
import { chase, reveal, turn } from "./opening.ts";
import { caseFile, client, form, montage } from "./product.ts";

const BEATS: Record<BeatId, (p: BeatProps, s: Sheet) => Scene> = { chase, turn, client, caseFile, form, montage, outcome, endCard };

// One beat on its own: what the layout tests and the design aid look at.
export function compose(id: BeatId, props: BeatProps): Composition {
  const s = new Sheet();
  const scene = BEATS[id](props, s);
  return { html: page(layoutFor(props.ratio), scene.background, s, (scene.backdrop ?? "") + scene.body), durationMs: props.durationMs };
}

const LEAVE_MS = 340;

// The whole cut as one document. Each beat is a layer over the one before; its content
// leaves softly in its last third of a second, so no beat ends on a hard cut, and a change
// of background colour is always drawn (a reveal), never jumped.
export function film(props: Omit<BeatProps, "durationMs">): Composition {
  const beats = beatsFor(props.cut), s = new Sheet(), l = layoutFor(props.ratio);
  let t0 = 0, colour: string | undefined, first = "";
  const layers = beats.map((b, i) => {
    s.offset = t0;
    const scene = BEATS[b.id]({ ...props, durationMs: b.durationMs }, s);
    const joins = colour !== undefined && colour !== scene.background;
    const backdrop = (joins ? reveal(s, l, scene.background, 0, 460) : "") + (scene.backdrop ?? "");
    s.offset = 0;
    const t1 = t0 + b.durationMs;
    const show = i === 0 ? "" : s.anim("from{opacity:0}to{opacity:1}", t0 - 1, 1, "linear");
    const leave = i === beats.length - 1 ? "" : s.anim("from{opacity:1;transform:none}to{opacity:0;transform:translateY(-26px) scale(.985)}", t1 - LEAVE_MS - 2, LEAVE_MS, "cubic-bezier(.5,0,.85,.5)");
    const background = joins ? colour! : scene.background;
    if (i === 0) first = background;
    colour = scene.end ?? scene.background;
    t0 = t1;
    return `<div data-beat="${b.id}" style="position:absolute;inset:0;overflow:hidden;background:${background};${show}">${backdrop}<div data-body style="position:absolute;inset:0;${leave}">${scene.body}</div></div>`;
  });
  return { html: page(l, first, s, layers.join("")), durationMs: t0 };
}
