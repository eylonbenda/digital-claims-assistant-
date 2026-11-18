import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { RecordedSegment } from "./record.ts";

const W = 1280, H = 720, FPS = 30;
const PHONE_H = 680;      // phone clip height inside the 720 frame
const PHONE_RIGHT = 110;  // gap right of the phone when a caption backdrop fills the left
const BACKGROUND = "#182438"; // the app's ink colour

// One ffmpeg run: desktop clips are scaled to the frame, phone clips sit centred on a
// plain background with a thin light border, everything is concatenated in scene order.
export function buildFfmpegArgs(segments: RecordedSegment[], outPath: string, bg: string): string[] {
  if (segments.length === 0) throw new Error("compose: no segments to compose");
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const s of segments) args.push("-i", s.file);
  // Backdrops (the caption panel recorded beside a phone clip) follow the segment inputs.
  const backdropInput = new Map<number, number>();
  segments.forEach((s, k) => {
    if (s.surface === "phone" && s.backdrop) {
      backdropInput.set(k, segments.length + backdropInput.size);
      args.push("-i", s.backdrop);
    }
  });
  const audioInput = segments.length + backdropInput.size;
  args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"); // silent track: some players dislike video-only files

  const parts: string[] = [];
  segments.forEach((s, k) => {
    if (s.surface === "phone") {
      const b = backdropInput.get(k);
      parts.push(b === undefined
        ? `color=c=${bg}:s=${W}x${H}:r=${FPS}[bg${k}]`
        : `[${b}:v]fps=${FPS},scale=${W}:${H},setsar=1[bg${k}]`);
      parts.push(`[${k}:v]fps=${FPS},scale=-2:${PHONE_H},pad=iw+8:ih+8:4:4:color=white,setsar=1[p${k}]`);
      const x = b === undefined ? "(W-w)/2" : `W-w-${PHONE_RIGHT}`;
      parts.push(`[bg${k}][p${k}]overlay=${x}:(H-h)/2:shortest=1[v${k}]`);
    } else {
      parts.push(`[${k}:v]fps=${FPS},scale=${W}:${H},setsar=1[v${k}]`);
    }
  });
  parts.push(`${segments.map((_, k) => `[v${k}]`).join("")}concat=n=${segments.length}:v=1:a=0,format=yuv420p[v]`);

  args.push(
    "-filter_complex", parts.join(";"),
    "-map", "[v]", "-map", `${audioInput}:a`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "32k",
    "-movflags", "+faststart", "-shortest",
    outPath,
  );
  return args;
}

export async function composeVideo(segments: RecordedSegment[], outPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error("compose: ffmpeg-static has no binary for this platform");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const args = buildFfmpegArgs(segments, outPath, BACKGROUND);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += String(d); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      fs.rmSync(outPath, { force: true }); // never leave a partial video behind
      reject(new Error(`ffmpeg failed (exit ${code}):\n${stderr.trim().split("\n").slice(-20).join("\n")}`));
    });
  });
}
