import { test } from "node:test";
import assert from "node:assert/strict";
import { holdMs } from "../stage/pacing.ts";

test("short caption gets the floor", () => assert.equal(holdMs("שלום"), 1800));
test("scales with length", () => assert.equal(holdMs("א".repeat(40)), 1200 + 55 * 40));
test("long caption is capped", () => assert.equal(holdMs("א".repeat(500)), 6000));
