import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COPY, INSURERS, SHARED, insurersWithTemplate } from "../copy.ts";
import { OUTPUTS, beatsFor, totalMs } from "../beats.ts";

test("both audiences have every copy line", () => {
  for (const a of ["garage", "agent"] as const) {
    assert.ok(COPY[a].hook.length > 0);
    assert.ok(COPY[a].outcome.length > 0);
  }
  assert.equal(COPY.garage.businessName, "מוסך הדגמה");
  assert.equal(COPY.agent.businessName, "סוכנות הדגמה");
});

test("nothing the garage version says contains the word for agent", () => {
  const lines = [...Object.values(COPY.garage), ...Object.values(SHARED).flat()];
  for (const l of lines) assert.ok(!l.includes("סוכן"), l);
});

test("call to action matches the landing page", () => {
  assert.equal(SHARED.ctaText, "לתיאום הדגמה בוואטסאפ");
  assert.equal(SHARED.ctaPhone, "052-448-8867");
  assert.equal(SHARED.tagline.join(" "), "פותחים תיק. סוגרים עניין.");
  assert.equal(SHARED.chat.length, 5);
});

test("insurer names are shown only when their template exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-tpl-"));
  fs.writeFileSync(path.join(dir, "harel.ts"), "");
  fs.writeFileSync(path.join(dir, "aig.ts"), "");
  assert.deepEqual(insurersWithTemplate(dir), ["הראל", "AIG"]);
  assert.equal(INSURERS.length, 9);
});

test("cut lengths", () => {
  assert.ok(totalMs("full") >= 35000 && totalMs("full") <= 40000, String(totalMs("full")));
  assert.ok(totalMs("short") >= 14500 && totalMs("short") <= 15500, String(totalMs("short")));
});

test("beat order, and the end card stays at least four seconds", () => {
  assert.deepEqual(beatsFor("full").map((b) => b.id), ["chase", "turn", "client", "caseFile", "form", "outcome", "endCard"]);
  assert.deepEqual(beatsFor("short").map((b) => b.id), ["chase", "montage", "endCard"]);
  for (const cut of ["full", "short"] as const) {
    assert.ok(beatsFor(cut).at(-1)!.durationMs >= 4000);
  }
});

test("the ten output files", () => {
  assert.deepEqual(OUTPUTS.map((o) => o.file).sort(), [
    "agent-15s-1x1.mp4", "agent-15s-9x16.mp4", "agent-16x9.mp4", "agent-1x1.mp4", "agent-9x16.mp4",
    "garage-15s-1x1.mp4", "garage-15s-9x16.mp4", "garage-16x9.mp4", "garage-1x1.mp4", "garage-9x16.mp4",
  ]);
});
