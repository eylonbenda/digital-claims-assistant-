import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPTURE_IDS, checkManifest, type Manifest } from "../manifest.ts";

const complete = (): Manifest => ({
  audience: "garage",
  capturedAt: "2026-11-18T10:00:00.000Z",
  captures: CAPTURE_IDS.map((id) => ({ id, file: `${id}.png`, width: 780, height: 1560, surface: "phone" })),
});

test("a complete manifest for the asked audience has no problems", () => {
  assert.deepEqual(checkManifest(complete(), "garage"), []);
});

test("captures of the other audience are refused", () => {
  const problems = checkManifest(complete(), "agent");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /garage/);
});

test("a missing capture is named", () => {
  const m = complete();
  m.captures = m.captures.filter((c) => c.id !== "pdf-page-1");
  assert.deepEqual(checkManifest(m, "garage"), ["missing capture: pdf-page-1"]);
});

test("a duplicated capture is named", () => {
  const m = complete();
  m.captures.push({ ...m.captures[0] });
  assert.deepEqual(checkManifest(m, "garage"), [`duplicate capture: ${CAPTURE_IDS[0]}`]);
});
