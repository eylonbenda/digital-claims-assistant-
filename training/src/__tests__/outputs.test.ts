import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearPreviousOutputs } from "../outputs.ts";

test("a new run removes the previous video and failure screenshots, and nothing else", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "training-out-"));
  for (const f of ["01-x.mp4", "02-other.mp4", "failed-step-a.png", "notes.txt"]) fs.writeFileSync(path.join(dir, f), "x");
  clearPreviousOutputs(dir, "01-x");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["02-other.mp4", "notes.txt"]);
});
test("a missing output directory is fine", () => clearPreviousOutputs(path.join(os.tmpdir(), "training-out-does-not-exist"), "x"));
