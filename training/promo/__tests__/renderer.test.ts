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
  assert.ok(a.some((x) => x.includes("apad")));
  assert.ok(!a.some((x) => x.startsWith("anullsrc")));
  const i = a.indexOf("-t");
  assert.equal(a[i + 1], "5.000");
});
