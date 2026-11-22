// The narrator's voice: one sound file per line of `narration.md`, laid over the film.
// The film is fitted to the voice, never the other way round: a part too short for its
// line is made longer (see `stretch` here and `fit` in edit.ts).
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Beat } from "./beats.ts";

export const VOICED = ["chase", "turn", "client", "caseFile", "form", "work", "handling", "outcome", "endCard"] as const;
export type VoiceId = (typeof VOICED)[number];
const TYPES = [".mp3", ".wav", ".m4a"];

export const LEAD = 0.4; // a line starts this long into its part, once the join has settled
export const TAIL = 0.6; // and ends this long before the part does, clear of the next join
export const roomFor = (voiceSeconds: number) => LEAD + voiceSeconds + TAIL;

// The sound files in a folder, by line. Null when there are none (a silent film); a folder
// with only some of the lines is a mistake, not a half-narrated film.
export function voiceFiles(dir: string): Record<VoiceId, string> | null {
  const found = VOICED.flatMap((id) => {
    const file = TYPES.map((t) => path.join(dir, id + t)).find((f) => fs.existsSync(f));
    return file ? [[id, file] as const] : [];
  });
  if (found.length === 0) return null;
  const missing = VOICED.filter((id) => !found.some(([f]) => f === id));
  if (missing.length > 0) throw new Error(`the narration in ${dir} has no file for: ${missing.join(", ")} (one .mp3, .wav or .m4a per line)`);
  return Object.fromEntries(found) as Record<VoiceId, string>;
}

// How long a sound file plays, by decoding it (a header's figure is only an estimate).
export function audioSeconds(file: string): Promise<number> {
  if (!ffmpegPath) throw new Error("promo: ffmpeg-static has no binary for this platform");
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, ["-hide_banner", "-nostdin", "-i", file, "-vn", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += String(d); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      const last = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].pop();
      if (code !== 0 || !last) return reject(new Error(`cannot read the sound file ${file}`));
      const seconds = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
      return seconds > 0 ? resolve(seconds) : reject(new Error(`the sound file ${file} is empty`));
    });
  });
}

export type Voice = Record<VoiceId, { file: string; seconds: number }>;
export async function loadVoice(dir: string): Promise<Voice | null> {
  const files = voiceFiles(dir);
  if (!files) return null;
  const voice = {} as Voice;
  for (const id of VOICED) voice[id] = { file: files[id], seconds: await audioSeconds(files[id]) };
  return voice;
}

// Drawn beats, each long enough for its line. A beat never gets shorter.
export function stretch(beats: Beat[], voiceSeconds: Partial<Record<string, number>>): Beat[] {
  return beats.map((b) => {
    const v = voiceSeconds[b.id];
    return v === undefined ? b : { ...b, durationMs: Math.max(b.durationMs, Math.ceil(roomFor(v) * 1000)) };
  });
}

// A clip of the film is one or more parts, each with a line. Returns when each line starts,
// in seconds from the start of the film; `join` is what neighbouring clips share.
export type Part = { id: VoiceId; seconds: number; voice: number };
export function cues(clips: { parts: Part[] }[], join: number): { id: VoiceId; at: number }[] {
  const out: { id: VoiceId; at: number; ends: number }[] = [];
  let start = 0;
  for (const clip of clips) {
    let t = start;
    for (const part of clip.parts) {
      out.push({ id: part.id, at: t + LEAD, ends: t + LEAD + part.voice });
      t += part.seconds;
    }
    start = t - join;
  }
  out.forEach((c, i) => {
    const next = out[i + 1];
    if (next && c.ends > next.at) throw new Error(`the "${c.id}" line runs ${(c.ends - next.at).toFixed(1)}s into the "${next.id}" line`);
  });
  return out.map(({ id, at }) => ({ id, at }));
}

// The audio half of the final filter: each line delayed to its cue, music (if any) under
// them. Lines are inputs `first`, `first + 1`, … in cue order. Ends in [a], padded with
// silence so the film's own length decides where it stops.
export function soundtrack(lines: { at: number }[], first: number, opts: { music?: { input: number; seconds: number } }): string {
  const tidy = "aresample=44100,aformat=channel_layouts=stereo";
  const parts = lines.map((c, i) => `[${first + i}:a]${tidy},adelay=${Math.round(c.at * 1000)}:all=1[n${i}]`);
  const labels = lines.map((_, i) => `[n${i}]`);
  if (opts.music) {
    const { input, seconds } = opts.music, fade = Math.min(1.5, seconds / 2);
    parts.push(`[${input}:a]${tidy},volume=${lines.length > 0 ? 0.16 : 1},afade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade}[m]`);
    labels.push("[m]");
  }
  parts.push(labels.length === 1 ? `${labels[0]}apad[a]` : `${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad[a]`);
  return parts.join(";");
}
