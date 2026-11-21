import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";

// A live recording of a page, sharper than Playwright's own video: the browser's screencast
// frames are kept as JPEGs with the time each one was drawn, and ffmpeg lays them on a
// constant-rate timeline. `mark(name)` notes a moment, in seconds from the first frame, so
// the edit can cut on it.
export type Recording = { file: string; marks: Record<string, number>; seconds: number; width: number; height: number };
export type Recorder = { mark(name: string): void; stop(): Promise<Recording> };

export async function startRecording(page: Page, file: string, size: { width: number; height: number }): Promise<Recorder> {
  const dir = `${file}.frames`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { at: number; file: string }[] = [];
  const marks: Record<string, number> = {};
  let last = 0;
  cdp.on("Page.screencastFrame", (f) => {
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
    const name = path.join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(name, Buffer.from(f.data, "base64"));
    last = f.metadata.timestamp ?? Date.now() / 1000;
    frames.push({ at: last, file: name });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  return {
    mark(name) { marks[name] = Date.now() / 1000; },
    async stop() {
      await page.waitForTimeout(150);
      const end = Date.now() / 1000;
      await cdp.send("Page.stopScreencast").catch(() => undefined);
      if (frames.length === 0) throw new Error("the recording has no frames");
      const t0 = frames[0].at;
      // The concat demuxer: each frame is shown until the next one was drawn.
      const list = frames.map((f, i) => {
        const until = i + 1 < frames.length ? frames[i + 1].at : Math.max(end, f.at + 0.04);
        return `file '${f.file.replace(/\\/g, "/")}'\nduration ${Math.max(0.001, until - f.at).toFixed(4)}`;
      }).join("\n") + `\nfile '${frames[frames.length - 1].file.replace(/\\/g, "/")}'\n`;
      const listFile = `${file}.txt`;
      fs.writeFileSync(listFile, list);
      await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile,
        "-vf", `fps=30,scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "14", file]);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(listFile, { force: true });
      return { file, seconds: end - t0, ...size, marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, Math.max(0, v - t0)])) };
    },
  };
}

export function ffmpeg(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error("promo: ffmpeg-static has no binary for this platform");
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += String(d); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed (exit ${code}):\n${stderr.trim().split("\n").slice(-20).join("\n")}`)));
  });
}
