import assert from "node:assert/strict";
import test from "node:test";
import { dissolve } from "../edit.ts";

test("one clip passes through at its own length", () => {
  assert.deepEqual(dissolve(["a"], [4], 0.5, "o"), { filter: "[a]null[o]", seconds: 4 });
});

test("each join overlaps its neighbours by the fade, and starts where the first ends less the fade", () => {
  const r = dissolve(["a", "b", "c"], [4, 3, 2], 0.5, "o");
  assert.equal(r.seconds, 8);
  assert.equal(r.filter, "[a][b]xfade=transition=fade:duration=0.5:offset=3.500[ox1];[ox1][c]xfade=transition=fade:duration=0.5:offset=6.000[o]");
});
