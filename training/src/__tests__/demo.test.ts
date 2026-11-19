import { test } from "node:test";
import assert from "node:assert/strict";
import { demoClaim, isValidIsraeliId } from "../demo.ts";

test("demo ID is 9 digits and checksum-valid", () => {
  assert.match(demoClaim.insured.id_number, /^\d{9}$/);
  assert.ok(isValidIsraeliId(demoClaim.insured.id_number));
});
test("demo plates are 7–8 digits", () => {
  for (const p of [demoClaim.vehicle.plate, demoClaim.thirdParty.plate]) assert.match(p, /^\d{7,8}$/);
});
test("checksum rejects a wrong digit", () => assert.equal(isValidIsraeliId("123456789"), false));
