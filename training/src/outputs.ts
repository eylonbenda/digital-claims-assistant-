import fs from "node:fs";
import path from "node:path";

// Called before recording: a failed run must not leave last time's video (or old failure
// screenshots) looking like this run's result.
export function clearPreviousOutputs(outDir: string, sceneId: string): void {
  if (!fs.existsSync(outDir)) return;
  for (const f of fs.readdirSync(outDir)) {
    if (f === `${sceneId}.mp4` || /^failed-.*\.png$/.test(f)) fs.rmSync(path.join(outDir, f), { force: true });
  }
}
