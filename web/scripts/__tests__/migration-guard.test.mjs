// node:test for .github/scripts/migration-guard.cjs (run: npm run test:scripts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = join(WEB, "..");
const require = createRequire(import.meta.url);
const { evaluate, recordsOwnVersion, LABEL } = require(join(REPO, ".github", "scripts", "migration-guard.cjs"));

const OWN_ROW = "insert into public.schema_migrations(version) values ('011') on conflict do nothing;";

function run({ files, labels = [LABEL], schemaTouched = true }) {
  const changed = Object.keys(files).map((name) => ({ filename: `web/db/migrations/${name}`, status: "added" }));
  if (schemaTouched) changed.push({ filename: "web/db/schema.sql", status: "modified" });
  return evaluate({
    changed,
    labels,
    migrationFiles: ["010_schema_migrations.sql", ...Object.keys(files)],
    readFile: (p) => files[p.split("/").pop()] ?? null,
  });
}

test("recordsOwnVersion: canonical single-row insert", () => {
  assert.equal(recordsOwnVersion(`create table x();\n${OWN_ROW}\n`, "011"), true);
});

test("recordsOwnVersion: multi-row backfill counts, case/whitespace/no schema prefix tolerated", () => {
  const sql = "INSERT INTO schema_migrations (version)\n  VALUES ('009'), ('010')\nON CONFLICT DO NOTHING;";
  assert.equal(recordsOwnVersion(sql, "010"), true);
});

test("recordsOwnVersion: wrong number fails", () => {
  assert.equal(recordsOwnVersion(OWN_ROW, "012"), false);
});

test("recordsOwnVersion: commented-out insert fails", () => {
  assert.equal(recordsOwnVersion(`-- ${OWN_ROW}\n/* ${OWN_ROW} */`, "011"), false);
});

test("recordsOwnVersion: '011' in some other insert does not count", () => {
  assert.equal(recordsOwnVersion("insert into claims(note) values ('011');", "011"), false);
});

test("evaluate: added migration without its schema_migrations row is blocked, even when attested", () => {
  const r = run({ files: { "011_foo.sql": "alter table claims add column x int;" } });
  assert.equal(r.ok, false);
  assert.match(r.failures.join("\n"), /Missing schema-version row: `011_foo\.sql`/);
});

test("evaluate: added migration with its row + label passes", () => {
  const r = run({ files: { "011_foo.sql": `alter table claims add column x int;\n${OWN_ROW}` } });
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
});

test("evaluate: edited pre-convention migrations are not checked for the row", () => {
  const r = evaluate({
    changed: [{ filename: "web/db/migrations/007_agent_briefs.sql", status: "modified" }],
    labels: [LABEL],
    migrationFiles: ["007_agent_briefs.sql"],
    readFile: () => "create table agent_briefs();",
  });
  assert.equal(r.ok, true);
});

test("repo: every migration from 010 on records its own version", () => {
  const dir = join(WEB, "db", "migrations");
  for (const name of readdirSync(dir)) {
    const version = /^(\d+)_.*\.sql$/.exec(name)?.[1];
    if (!version || Number(version) < 10) continue;
    assert.ok(recordsOwnVersion(readFileSync(join(dir, name), "utf8"), version), `${name} lacks its schema_migrations row`);
  }
});
