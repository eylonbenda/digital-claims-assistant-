import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { buildEncodeArgs, frameAt, prepare } from "../renderer.ts";
import { spike } from "../compositions/spike.ts";

let browser: Browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

test("the same frame renders to identical bytes twice", async () => {
  const shots: Buffer[] = [];
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage();
    await prepare(page, spike("9x16"), "9x16");
    shots.push(await frameAt(page, 1500));
    await page.close();
  }
  assert.ok(shots[0].equals(shots[1]));
});

test("frames advance with the virtual clock", async () => {
  const page = await browser.newPage();
  await prepare(page, spike("1x1"), "1x1");
  const a = await frameAt(page, 0);
  const b = await frameAt(page, 2000);
  await page.close();
  assert.ok(!a.equals(b));
});

test("a composition without the bundled fonts is refused", async () => {
  const page = await browser.newPage();
  const html = `<html dir="rtl"><body><h1 style="font-family:'Frank Ruhl Libre'">שלום</h1></body></html>`;
  await assert.rejects(prepare(page, { html, durationMs: 1000 }, "1x1"), /font not loaded/);
  await page.close();
});

test("encode args: silent track by default", () => {
  const a = buildEncodeArgs("o.mp4", "1x1", { durationMs: 5000 });
  const has = (...seq: string[]) => a.some((_, i) => seq.every((s, k) => a[i + k] === s));
  assert.ok(has("-pix_fmt", "yuv420p"));
  assert.ok(has("-movflags", "+faststart"));
  assert.ok(has("-r", "30"));
  assert.ok(has("-t", "5.000"));
  assert.ok(a.some((x) => x.startsWith("anullsrc")));
  assert.equal(a.at(-1), "o.mp4");
});

test("encode args: music replaces the silent track and fades out", () => {
  const a = buildEncodeArgs("o.mp4", "1x1", { durationMs: 5000, music: "m.mp3" });
  assert.ok(a.includes("m.mp3"));
  assert.ok(a.some((x) => x.includes("afade=t=out")));
  assert.ok(!a.some((x) => x.startsWith("anullsrc")));
  const i = a.indexOf("-t");
  assert.equal(a[i + 1], "5.000");
});

// ── Failure paths found in review ──────────────────────────────────────────────────────
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { encodeFrames } from "../renderer.ts";
import { fontFaceCss } from "../fonts.ts";

const withFonts = (extraCss: string, body: string) =>
  `<html dir="rtl"><head><style>${fontFaceCss()}${extraCss}</style></head><body>${body}</body></html>`;

test("one face that fails to load is refused by name, even when its family has others", async () => {
  const page = await browser.newPage();
  const broken = `@font-face{font-family:"Heebo";font-weight:300;src:url(data:font/woff2;base64,AAAA) format("woff2");}`;
  await assert.rejects(prepare(page, { html: withFonts(broken, "<p>שלום</p>"), durationMs: 1000 }, "1x1"), /font not loaded: Heebo 300/);
  await page.close();
});

test("a picture that cannot be decoded is refused instead of rendering blank", async () => {
  const page = await browser.newPage();
  const html = withFonts("", `<img src="data:image/png;base64,AAAA" alt="">`);
  await assert.rejects(prepare(page, { html, durationMs: 1000 }, "1x1"), /picture failed to load/);
  await page.close();
});

async function oneFrame(): Promise<Buffer> {
  const page = await browser.newPage();
  await prepare(page, spike("1x1"), "1x1");
  const frame = await frameAt(page, 2000);
  await page.close();
  return frame;
}

test("encoding fails, and does not hang, when ffmpeg dies mid-stream", { timeout: 30_000 }, async () => {
  const frame = await oneFrame();
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "promo-enc-")), "video.not-a-format");
  await assert.rejects(encodeFrames(out, "1x1", async (write) => { for (let i = 0; i < 400; i++) await write(frame); }, { durationMs: 2000 }), /ffmpeg/);
  assert.ok(!fs.existsSync(out));
});

test("music shorter than the video is looped, and the file is exactly the video's length", { timeout: 60_000 }, async () => {
  const frame = await oneFrame();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-music-"));
  const music = path.join(dir, "short.mp3"), out = path.join(dir, "with-music.mp4");
  spawnSync(ffmpegPath as unknown as string, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", music]);
  assert.ok(fs.existsSync(music));
  await encodeFrames(out, "1x1", async (write) => { for (let i = 0; i < 60; i++) await write(frame); }, { durationMs: 2000, music });
  const info = spawnSync(ffmpegPath as unknown as string, ["-hide_banner", "-i", out], { encoding: "utf8" }).stderr;
  assert.match(info, /Duration: 00:00:02\.0/);
  assert.match(info, /Audio: aac/);
  // The sound must still be there near the end, not half a second of tone and then silence.
  const tail = spawnSync(ffmpegPath as unknown as string, ["-hide_banner", "-ss", "1.2", "-t", "0.2", "-i", out, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const mean = Number(/mean_volume: (-?[0-9.]+) dB/.exec(tail)?.[1]);
  assert.ok(mean > -50, `tail is silent (${mean} dB)`);
});

test("encode args: colours are tagged BT.709, and music loops", () => {
  const a = buildEncodeArgs("o.mp4", "16x9", { durationMs: 5000, music: "m.mp3" });
  const i = a.indexOf("m.mp3");
  assert.deepEqual(a.slice(i - 3, i), ["-stream_loop", "-1", "-i"]);
  assert.ok(a.some((x) => x.includes("out_color_matrix=bt709")));
  for (const flag of ["-colorspace", "-color_primaries", "-color_trc"]) assert.equal(a[a.indexOf(flag) + 1], "bt709");
});
