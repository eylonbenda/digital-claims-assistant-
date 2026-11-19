import { test } from "node:test";
import assert from "node:assert/strict";
import { demoUserDecision, newMarkerPhone } from "../seed-rules.ts";

test("no existing user: create one", () => assert.equal(demoUserDecision(null), "create"));
test("a user this tool created (stamped) is reused", () =>
  assert.equal(demoUserDecision({ app_metadata: { training_demo: true } }), "use"));
test("an existing account without the stamp is never taken over", () => {
  assert.equal(demoUserDecision({ app_metadata: {} }), "refuse");
  assert.equal(demoUserDecision({ app_metadata: { training_demo: "true" } }), "refuse");
  assert.equal(demoUserDecision({}), "refuse");
});
test("marker phone looks like a phone number and changes per run", () => {
  const a = newMarkerPhone(), b = newMarkerPhone();
  assert.match(a, /^05000[0-9]{5}$/);
  assert.notEqual(a, b);
});
