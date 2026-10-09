import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findTablesWithoutRls, createdTables, loadSources } from "../check-rls.mjs";

const src = (sql, file = "x.sql") => [{ file, sql }];

test("flags a table with no RLS", () => {
  const missing = findTablesWithoutRls(src("create table foo (id int);"));
  assert.deepEqual(missing, [{ table: "foo", file: "x.sql" }]);
});

test("passes when RLS is enabled, in any file, any case/spacing", () => {
  const sources = [
    { file: "a.sql", sql: "CREATE TABLE IF NOT EXISTS public.\"Foo\" (id int);\r\ncreate table bar(id int);" },
    { file: "b.sql", sql: "alter table if exists foo\n  ENABLE ROW LEVEL SECURITY;\nALTER TABLE ONLY public.bar enable row level security;" },
  ];
  assert.deepEqual(findTablesWithoutRls(sources), []);
});

test("ignores commented-out statements", () => {
  assert.deepEqual(createdTables(src("-- create table ghost (id int);\n/* create table ghost2 () */")).size, 0);
  const sql = "create table foo (id int);\n-- alter table foo enable row level security;";
  assert.equal(findTablesWithoutRls(src(sql)).length, 1, "a commented RLS line must not count");
});

test("ignores tables outside schema public", () => {
  assert.deepEqual(findTablesWithoutRls(src("create table storage.things (id int);")), []);
});

test("RLS on a different table does not satisfy the check", () => {
  const sql = "create table foo (id int); alter table foobar enable row level security;";
  assert.equal(findTablesWithoutRls(src(sql)).length, 1);
});

test("the repo's schema + migrations pass", () => {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  assert.deepEqual(findTablesWithoutRls(loadSources(webRoot)), []);
});
