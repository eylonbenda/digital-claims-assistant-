import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentName } from "../../src/seed-rules.ts";
import { promoFixtures } from "../fixtures.ts";

test("the demo business keeps its name unless one is given", () => {
  assert.equal(agentName(), "מוסך הדגמה");
  assert.equal(agentName({ businessName: "סוכנות הדגמה" }), "סוכנות הדגמה");
});

function dirWithUserPhotos(n: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-fx-"));
  fs.mkdirSync(path.join(dir, "user"));
  for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, "user", `p${i}.jpg`), "x");
  return dir;
}

test("generated car pictures are used when the user supplied fewer than three", () => {
  for (const n of [0, 2]) {
    const dir = dirWithUserPhotos(n);
    assert.deepEqual(promoFixtures(dir).cars.map((c) => path.basename(c)), ["car-1.png", "car-2.png", "car-3.png"]);
  }
});

test("three or more user photos replace the generated ones", () => {
  const dir = dirWithUserPhotos(3);
  fs.writeFileSync(path.join(dir, "user", "notes.txt"), "x");
  const cars = promoFixtures(dir).cars;
  assert.deepEqual(cars.map((c) => path.basename(c)), ["p0.jpg", "p1.jpg", "p2.jpg"]);
  assert.ok(cars.every((c) => c.includes(`${path.sep}user${path.sep}`)));
});
