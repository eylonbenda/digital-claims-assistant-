import assert from "node:assert/strict";
import test from "node:test";
import { fit, pace, type Take } from "../edit.ts";
import { chunks, timed, subtitleFilter } from "../subtitles.ts";
import type { Recording } from "../screencast.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

test("a short line is one subtitle, without its closing full stop", () => {
  assert.deepEqual(chunks("עם אופן־תיק שולחים ללקוח קישור אחד.", 40), ["עם אופן־תיק שולחים ללקוח קישור אחד"]);
});

test("a long line breaks at its punctuation, and no subtitle is longer than the limit", () => {
  const line = "הוא עונה על כמה שאלות, מצלם את המסמכים ואת הרכב, ושולח. הכול מהטלפון, בלי התקנה.";
  const got = chunks(line, 30);
  assert.deepEqual(got, ["הוא עונה על כמה שאלות", "מצלם את המסמכים ואת הרכב", "ושולח", "הכול מהטלפון, בלי התקנה"]);
  for (const c of got) assert.ok(c.length <= 30, c);
});

test("a clause longer than the limit is split between words, into even parts", () => {
  const got = chunks("אצלכם במשרד התיק כבר פתוח והכול מסודר במקום אחד", 30);
  assert.equal(got.length, 2);
  assert.equal(got.join(" "), "אצלכם במשרד התיק כבר פתוח והכול מסודר במקום אחד");
  for (const c of got) assert.ok(c.length <= 30 && c.length >= 15, c);
});

test("a question keeps its question mark", () => {
  assert.deepEqual(chunks("חסר מסמך? המערכת שולחת תזכורת.", 30), ["חסר מסמך?", "המערכת שולחת תזכורת"]);
});

test("subtitles share the line's time by their length, back to back", () => {
  const got = timed(["אבגד", "אבגדהוזח"], 10, 6);
  assert.deepEqual(got.map((s) => s.text), ["אבגד", "אבגדהוזח"]);
  near(got[0].from, 10); near(got[0].to, 12);
  near(got[1].from, 12); near(got[1].to, 16);
});

test("each subtitle is laid over the film only for its own time", () => {
  const f = subtitleFilter([{ text: "א", from: 0.4, to: 2 }, { text: "ב", from: 2, to: 3.5 }], 9, "v0", "v");
  assert.equal(f, "[v0][9:v]overlay=0:0:enable='between(t,0.400,2.000)'[s0];[s0][10:v]overlay=0:0:enable='between(t,2.000,3.500)'[v]");
  assert.equal(subtitleFilter([], 9, "v0", "v"), "[v0]null[v]");
});

test("a narrated film moves faster, but a screen still leaves room for its line", () => {
  const rec: Recording = { file: "r.mp4", marks: { a: 0, b: 12 }, seconds: 100, width: 10, height: 10 };
  const takes: Take[] = [{ rec, from: "a", to: "b", speed: 1.2 }];
  near(pace(takes, 1.5)[0].speed, 1.8);
  assert.deepEqual(pace(takes, 1), takes);
  const [t] = fit(pace(takes, 1.5), 9); // 12 / 1.8 = 6.7 s is too short for a 9 s line
  near(12 / t.speed + (t.hold ?? 0), 9);
});
