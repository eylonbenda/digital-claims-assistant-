// How long a caption stays up before the next step: reading time, floored and capped.
export function holdMs(caption: string): number {
  return Math.min(6000, Math.max(1800, 1200 + 55 * [...caption].length));
}
