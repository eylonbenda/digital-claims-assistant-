import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { OUTPUTS, totalMs } from "../beats.ts";
import type { Audience } from "../copy.ts";
import { CAPTURE_IDS, captureDir, type Manifest } from "../manifest.ts";
import { renderOutput, selectOutputs } from "../render.ts";
import { frameCount } from "../timeline.ts";

let browser: Browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8e/fufwAIkgNmFkKrVQAAAABJRU5ErkJggg==", "base64");

// Every part a composition may point the camera at, somewhere in the stand-in.
const MARKS = Object.fromEntries(["question", "answer", "licence", "registration", "photos", "next", "title", "name", "tabs", "verdict", "filled", "generate"]
  .map((name, i) => [name, { x: 0.1, y: 0.05 + i * 0.07, w: 0.5, h: 0.04, px: 16 }]));

// An out dir holding stand-in captures, recorded as belonging to `audience`.
function outDirWithCaptures(folder: Audience, audience: Audience): string {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "promo-out-"));
  const dir = captureDir(folder, out);
  fs.mkdirSync(dir, { recursive: true });
  const manifest: Manifest = {
    audience, capturedAt: new Date().toISOString(),
    captures: CAPTURE_IDS.map((id) => {
      fs.writeFileSync(path.join(dir, `${id}.png`), PIXEL);
      return { id, file: `${id}.png`, width: 780, height: 1560, surface: "phone" as const, cssWidth: 320, marks: MARKS };
    }),
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return out;
}

test("no flags selects all ten outputs; flags narrow them", () => {
  assert.equal(selectOutputs([]).length, 10);
  assert.equal(selectOutputs(["--audience", "garage", "--ratio", "9x16"]).length, 2);
  assert.equal(selectOutputs(["--cut", "short"]).length, 4);
  assert.throws(() => selectOutputs(["--ratio", "4x3"]), /--ratio/);
  assert.throws(() => selectOutputs(["--colour", "blue"]), /--colour/);
});

test("a rendered cut has exactly the frames of its length, and plays", async () => {
  const out = outDirWithCaptures("garage", "garage");
  const o = OUTPUTS.find((x) => x.audience === "garage" && x.cut === "short" && x.ratio === "1x1")!;
  const r = await renderOutput(browser, o, { outDir: out });
  assert.equal(r.frames, frameCount(totalMs("short")));
  assert.ok(fs.statSync(r.file).size > 10_000);
  assert.equal(path.basename(r.file), "garage-15s-1x1.mp4");
  assert.deepEqual(fs.readdirSync(path.dirname(r.file)).filter((n) => n.endsWith(".mp4")), ["garage-15s-1x1.mp4"]);
});

test("captures of the other audience are refused and nothing is written", async () => {
  const out = outDirWithCaptures("agent", "garage"); // the agent folder holds garage captures
  const o = OUTPUTS.find((x) => x.audience === "agent" && x.cut === "short" && x.ratio === "1x1")!;
  await assert.rejects(renderOutput(browser, o, { outDir: out }), /garage version/);
  assert.ok(!fs.existsSync(path.join(out, "promo", o.file)));
});

test("a music path that does not exist is an error before anything renders", async () => {
  const out = outDirWithCaptures("garage", "garage");
  const o = OUTPUTS.find((x) => x.audience === "garage" && x.cut === "short" && x.ratio === "1x1")!;
  await assert.rejects(renderOutput(browser, o, { outDir: out, music: path.join(out, "nope.mp3") }), /PROMO_MUSIC/);
  assert.ok(!fs.existsSync(path.join(out, "promo", o.file)));
});
