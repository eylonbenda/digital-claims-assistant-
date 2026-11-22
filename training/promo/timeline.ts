export const FPS = 30;

export type Ratio = "9x16" | "1x1" | "16x9";
export const RATIOS: Ratio[] = ["9x16", "1x1", "16x9"];

export const SIZE: Record<Ratio, { width: number; height: number }> = {
  "9x16": { width: 1080, height: 1920 },
  "1x1": { width: 1080, height: 1080 },
  "16x9": { width: 1920, height: 1080 },
};

export function frameCount(durationMs: number, fps = FPS): number {
  return Math.round((durationMs * fps) / 1000);
}

export function frameTimeMs(index: number, fps = FPS): number {
  return (index * 1000) / fps;
}
