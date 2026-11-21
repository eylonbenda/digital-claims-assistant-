import { test } from "node:test";
import assert from "node:assert/strict";
import { frameCount, frameTimeMs } from "../timeline.ts";

test("frameCount at 30 fps", () => {
  assert.equal(frameCount(5000), 150);
  assert.equal(frameCount(15000), 450);
});

test("frameTimeMs at 30 fps", () => {
  assert.equal(frameTimeMs(0), 0);
  assert.equal(frameTimeMs(30), 1000);
});
