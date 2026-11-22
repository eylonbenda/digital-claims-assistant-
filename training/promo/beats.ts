import { AUDIENCES, type Audience } from "./copy.ts";
import { RATIOS, type Ratio } from "./timeline.ts";

export type Cut = "full" | "short";
export type BeatId = "chase" | "turn" | "client" | "caseFile" | "form" | "montage" | "outcome" | "endCard";
export type Beat = { id: BeatId; durationMs: number };

const CUTS: Record<Cut, Beat[]> = {
  full: [
    { id: "chase", durationMs: 4000 },
    { id: "turn", durationMs: 3000 },
    { id: "client", durationMs: 7000 },
    { id: "caseFile", durationMs: 6000 },
    { id: "form", durationMs: 7000 },
    { id: "outcome", durationMs: 5500 },
    { id: "endCard", durationMs: 5000 },
  ],
  short: [
    { id: "chase", durationMs: 2500 },
    { id: "montage", durationMs: 8000 },
    { id: "endCard", durationMs: 4500 },
  ],
};

export function beatsFor(cut: Cut): Beat[] {
  return CUTS[cut];
}

export function totalMs(cut: Cut): number {
  return CUTS[cut].reduce((sum, b) => sum + b.durationMs, 0);
}

export type Output = { audience: Audience; cut: Cut; ratio: Ratio; file: string };

// Full cut in every ratio; the 15-second ad cut only where ads run (vertical and square).
export const OUTPUTS: Output[] = AUDIENCES.flatMap((audience) => [
  ...RATIOS.map((ratio): Output => ({ audience, cut: "full", ratio, file: `${audience}-${ratio}.mp4` })),
  ...(["9x16", "1x1"] as Ratio[]).map((ratio): Output => ({ audience, cut: "short", ratio, file: `${audience}-15s-${ratio}.mp4` })),
]);
