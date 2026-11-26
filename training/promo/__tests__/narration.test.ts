import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fit, type Take } from "../edit.ts";
import { LEAD, TAIL, VOICED, cues, roomFor, soundtrack, stretch, voiceFiles } from "../narration.ts";
import type { Recording } from "../screencast.ts";

const rec = (marks: Record<string, number>): Recording => ({ file: "r.mp4", marks, seconds: 100, width: 10, height: 10 });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
// What a screen runs for: its takes, less the dissolves between them, plus any hold.
const runs = (takes: Take[]) => takes.reduce((s, t) => s + (t.rec.marks[t.to] - t.rec.marks[t.from]) / t.speed + (t.hold ?? 0), 0) - 0.3 * (takes.length - 1);

test("a line needs room to start after the join and end before the next one", () => {
  near(roomFor(3), LEAD + 3 + TAIL);
});

test("a screen already long enough for its line is left alone", () => {
  const takes: Take[] = [{ rec: rec({ a: 0, b: 10 }), from: "a", to: "b", speed: 2 }];
  assert.deepEqual(fit(takes, 4), takes);
});

test("a screen too short for its line is slowed, every take by the same share", () => {
  const r = rec({ a: 0, b: 6, c: 12 });
  const takes: Take[] = [{ rec: r, from: "a", to: "b", speed: 2 }, { rec: r, from: "b", to: "c", speed: 1.5 }];
  const fitted = fit(takes, 8.7); // runs 3 + 4 - 0.3 = 6.7 before
  near(runs(fitted), 8.7);
  near(fitted[0].speed / fitted[1].speed, 2 / 1.5);
  assert.equal(fitted[1].hold, undefined);
});

test("footage is never slowed past 0.8 of real time; the last picture is held for the rest", () => {
  const takes: Take[] = [{ rec: rec({ a: 0, b: 4 }), from: "a", to: "b", speed: 1 }];
  const [t] = fit(takes, 9);
  near(t.speed, 0.8);
  near(t.hold!, 4);
  near(runs([t]), 9);
});

test("a drawn beat grows to hold its line and never shrinks", () => {
  const beats = [{ id: "chase" as const, durationMs: 4000 }, { id: "turn" as const, durationMs: 3000 }];
  const got = stretch(beats, { chase: 9, turn: 1 });
  assert.equal(got[0].durationMs, Math.ceil(roomFor(9) * 1000));
  assert.equal(got[1].durationMs, 3000);
  assert.deepEqual(stretch(beats, {}), beats);
});

test("each line starts a moment into its own part of the film", () => {
  const got = cues([
    { parts: [{ id: "chase", seconds: 5, voice: 4 }, { id: "turn", seconds: 3, voice: 2 }] },
    { parts: [{ id: "client", seconds: 6, voice: 5 }] },
  ], 0.5);
  assert.deepEqual(got.map((c) => c.id), ["chase", "turn", "client"]);
  near(got[0].at, LEAD);
  near(got[1].at, 5 + LEAD);
  near(got[2].at, 8 - 0.5 + LEAD); // the second clip starts where the first ends, less the join
});

test("a line that would run into the next one is refused", () => {
  assert.throws(() => cues([{ parts: [{ id: "chase", seconds: 2, voice: 4 }, { id: "turn", seconds: 3, voice: 1 }] }], 0.5), /chase/);
});

test("the soundtrack delays each line to its cue and mixes them at full level", () => {
  const s = soundtrack([{ at: 0.4 }, { at: 7.9 }], 3, {});
  assert.equal(s, "[3:a]aresample=44100,aformat=channel_layouts=stereo,adelay=400:all=1[n0];[4:a]aresample=44100,aformat=channel_layouts=stereo,adelay=7900:all=1[n1];[n0][n1]amix=inputs=2:normalize=0,apad[a]");
});

test("music sits under the voice and fades out at the end", () => {
  const s = soundtrack([{ at: 0.4 }], 3, { music: { input: 4, seconds: 20 } });
  assert.match(s, /\[4:a\]aresample=44100,aformat=channel_layouts=stereo,volume=0\.16,afade=t=out:st=18\.500:d=1\.5\[m\]/);
  assert.match(s, /\[n0\]\[m\]amix=inputs=2:normalize=0,apad\[a\]$/);
});

test("music alone plays at its own level", () => {
  assert.equal(soundtrack([], 3, { music: { input: 3, seconds: 20 } }), "[3:a]aresample=44100,aformat=channel_layouts=stereo,volume=1,afade=t=out:st=18.500:d=1.5[m];[m]apad[a]");
});

test("no voice folder means a silent film; a partial one is an error that names what is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-"));
  try {
    assert.equal(voiceFiles(path.join(dir, "absent")), null);
    assert.equal(voiceFiles(dir), null);
    for (const id of VOICED.slice(0, 7)) fs.writeFileSync(path.join(dir, `${id}.mp3`), "");
    assert.throws(() => voiceFiles(dir), /outcome, endCard/);
    fs.writeFileSync(path.join(dir, "outcome.wav"), "");
    fs.writeFileSync(path.join(dir, "endCard.m4a"), "");
    const files = voiceFiles(dir)!;
    assert.equal(files.outcome, path.join(dir, "outcome.wav"));
    assert.equal(Object.keys(files).length, 9);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
