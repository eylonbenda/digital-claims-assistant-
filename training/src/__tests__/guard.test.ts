import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTarget } from "../guard.ts";

const base = { baseUrl: "http://localhost:3100", versionEnv: "local",
  supabaseUrl: "https://dev.supabase.co", prodSupabaseUrl: "https://prod.supabase.co" as string | null,
  confirmedDevUrl: null as string | null };
test("local dev target passes", () => assert.deepEqual(checkTarget(base), { ok: true }));
test("127.0.0.1 passes", () => assert.equal(checkTarget({ ...base, baseUrl: "http://127.0.0.1:3101" }).ok, true));
test("non-local host is refused", () => assert.equal(checkTarget({ ...base, baseUrl: "https://app.example.com" }).ok, false));
test("a host that merely starts with localhost is refused", () =>
  assert.equal(checkTarget({ ...base, baseUrl: "http://localhost.example.com" }).ok, false));
test("production env is refused", () => assert.equal(checkTarget({ ...base, versionEnv: "production" }).ok, false));
test("unreachable app is refused with the URL in the reason", () => {
  const r = checkTarget({ ...base, versionEnv: null });
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /localhost:3100/);
});
test("seed pointed at prod is refused", () =>
  assert.equal(checkTarget({ ...base, supabaseUrl: "https://prod.supabase.co" }).ok, false));
test("trailing slash / case differences still match the denylist", () =>
  assert.equal(checkTarget({ ...base, supabaseUrl: "https://PROD.supabase.co/" }).ok, false));
test("with neither a prod denylist nor a dev confirmation the target is refused", () => {
  const r = checkTarget({ ...base, prodSupabaseUrl: null });
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /PROD_SUPABASE_URL/);
});
test("an explicit dev confirmation matching SUPABASE_URL passes without a denylist", () =>
  assert.equal(checkTarget({ ...base, prodSupabaseUrl: null, confirmedDevUrl: "https://DEV.supabase.co/" }).ok, true));
test("a dev confirmation that does not match SUPABASE_URL is refused", () =>
  assert.equal(checkTarget({ ...base, prodSupabaseUrl: null, confirmedDevUrl: "https://other.supabase.co" }).ok, false));
test("the denylist wins even when the same URL is 'confirmed' as dev", () =>
  assert.equal(checkTarget({ ...base, supabaseUrl: "https://prod.supabase.co", confirmedDevUrl: "https://prod.supabase.co" }).ok, false));
