import type { BeatId } from "../beats.ts";
import type { Composition } from "../renderer.ts";
import { endCard, outcome } from "./closing.ts";
import type { BeatProps } from "./layout.ts";
import { chase, turn } from "./opening.ts";
import { caseFile, client, form, montage } from "./product.ts";

const BEATS: Record<BeatId, (p: BeatProps) => Composition> = { chase, turn, client, caseFile, form, montage, outcome, endCard };

export function compose(id: BeatId, props: BeatProps): Composition {
  return BEATS[id](props);
}
