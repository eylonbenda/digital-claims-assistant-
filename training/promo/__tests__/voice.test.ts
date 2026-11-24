import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { VOICED, gainFor, soundtrack } from "../narration.ts";
import { hebrewVoices, scriptLines, spoken, stamp, ttsRequest } from "../voice.ts";

const script = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "narration.md"), "utf8");

test("the script has a line for every narrated beat, for both audiences", () => {
  for (const audience of ["garage", "agent"] as const) {
    const lines = scriptLines(script, audience);
    assert.deepEqual(Object.keys(lines), [...VOICED]);
    for (const id of VOICED) assert.ok(lines[id].length > 10, `${audience}/${id}`);
  }
  assert.match(scriptLines(script, "garage").chase, /^לקוח התקשר/);
  assert.match(scriptLines(script, "agent").chase, /^מבוטח התקשר/);
});

test("a script that lacks a line is refused, by name", () => {
  const broken = script.replace(/^\| outcome \|.*\n/m, "");
  assert.throws(() => scriptLines(broken, "garage"), /garage.*outcome/);
});

test("the garage narration never says the word the garage cut avoids", () => {
  assert.throws(() => scriptLines(script.replace("לקוח התקשר", "סוכן התקשר"), "garage"), /סוכן/);
});

test("the product name is spelled for the voice the way it is pronounced", () => {
  assert.equal(spoken("עם אופן־תיק שולחים"), "עם אוֹפּן־טיק שולחים");
  assert.equal(spoken("בלי שם המוצר"), "בלי שם המוצר");
});

test("a line is requested in Hebrew, with its neighbours for a natural flow", () => {
  const { url, init } = ttsRequest({ text: "שורה", voiceId: "v1", model: "eleven_v4", key: "k", previous: "לפני", next: "אחרי" });
  assert.equal(url, "https://api.elevenlabs.io/v1/text-to-speech/v1?output_format=mp3_44100_128");
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, { "xi-api-key": "k", "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(init.body), { text: "שורה", model_id: "eleven_v4", language_code: "he", previous_text: "לפני", next_text: "אחרי" });
});

test("the first line has no previous text", () => {
  const body = JSON.parse(ttsRequest({ text: "שורה", voiceId: "v1", model: "m", key: "k", next: "אחרי" }).init.body);
  assert.equal("previous_text" in body, false);
});

test("a line is made again only when its words, voice or model change", () => {
  const a = stamp({ text: "שורה", voiceId: "v1", model: "m" });
  assert.equal(a, stamp({ text: "שורה", voiceId: "v1", model: "m" }));
  assert.notEqual(a, stamp({ text: "שורה אחרת", voiceId: "v1", model: "m" }));
  assert.notEqual(a, stamp({ text: "שורה", voiceId: "v2", model: "m" }));
  assert.notEqual(a, stamp({ text: "שורה", voiceId: "v1", model: "m2" }));
});

test("only voices verified for Hebrew are offered", () => {
  const got = hebrewVoices([
    { voice_id: "a", name: "A", verified_languages: [{ language: "en" }, { language: "he", model_id: "eleven_v4" }] },
    { voice_id: "b", name: "B", verified_languages: [{ language: "en" }] },
    { voice_id: "c", name: "C" },
  ]);
  assert.deepEqual(got.map((v) => v.voice_id), ["a"]);
});

test("a line is brought to the target loudness, up or down", () => {
  assert.equal(gainFor(-22), 6); // -22 → -16
  assert.equal(gainFor(-12.5), -3.5);
});

test("the soundtrack levels each line and the music, with a limiter after the gain", () => {
  const s = soundtrack([{ at: 0.4, gain: 2.5 }], 3, { music: { input: 4, seconds: 20, gain: -3 } });
  assert.ok(s.includes("[3:a]aresample=44100,aformat=channel_layouts=stereo,volume=2.50dB,alimiter=limit=0.84:level=disabled,adelay=400:all=1[n0]"), s);
  assert.ok(s.includes("[4:a]aresample=44100,aformat=channel_layouts=stereo,volume=-3.00dB,alimiter=limit=0.84:level=disabled,volume=0.16,"), s);
});
