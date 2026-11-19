import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScene, type Scene } from "../scene.ts";

const step = (name: string) => ({ name, run: async () => {} });
const ok: Scene = { id: "x", segments: [{ surface: "desktop", steps: [step("a"), step("b")] }, { surface: "phone", steps: [step("c")] }] };

test("valid scene has no errors", () => assert.deepEqual(validateScene(ok), []));
test("empty segments is an error", () => assert.equal(validateScene({ id: "x", segments: [] }).length, 1));
test("segment without steps is an error naming the segment", () => {
  const errs = validateScene({ id: "x", segments: [ok.segments[0], { surface: "phone", steps: [] }] });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /segment 2/);
});
test("duplicate step names are an error, even across segments", () => {
  const errs = validateScene({ id: "x", segments: [{ surface: "desktop", steps: [step("a")] }, { surface: "phone", steps: [step("a")] }] });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /"a"/);
});
test("a step name that cannot be a file name is an error", () =>
  assert.equal(validateScene({ id: "x", segments: [{ surface: "desktop", steps: [step("a/b")] }] }).length, 1));
