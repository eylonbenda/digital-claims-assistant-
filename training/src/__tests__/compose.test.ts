import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFfmpegArgs } from "../compose.ts";

const segs = [
  { surface: "desktop" as const, file: "a.webm" },
  { surface: "phone" as const, file: "b.webm" },
  { surface: "desktop" as const, file: "c.webm" },
];
const args = buildFfmpegArgs(segs, "out.mp4", "#0f172a");
const joined = args.join(" ");

test("inputs keep scene order", () =>
  assert.deepEqual(args.filter((_, i) => args[i - 1] === "-i").slice(0, 3), ["a.webm", "b.webm", "c.webm"]));
test("concat covers all segments", () => assert.match(joined, /concat=n=3:v=1:a=0/));
test("only the phone segment is overlaid on the background", () => assert.equal((joined.match(/overlay=/g) ?? []).length, 1));
test("whatsapp-safe encode flags", () => { for (const f of ["libx264", "yuv420p", "+faststart"]) assert.ok(args.includes(f), f); });
test("30 fps, 1280x720 output", () => { assert.match(joined, /fps=30/); assert.match(joined, /1280[x:]720/); });
test("has a silent audio input", () => assert.match(joined, /anullsrc/));
test("output path is last", () => assert.equal(args.at(-1), "out.mp4"));
test("no segments throws", () => assert.throws(() => buildFfmpegArgs([], "out.mp4", "#000")));
