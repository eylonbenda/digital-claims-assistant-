#!/usr/bin/env node
// RLS guard: every table created in schema public (db/schema.sql + db/migrations/*.sql)
// must have a matching `alter table <name> enable row level security` somewhere in
// those files. Without it, the table is exposed to whatever PostgREST grants exist.
// Usage: node scripts/check-rls.mjs   (exit 1 + list on failure). No deps — runs pre-install in CI.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IDENT = String.raw`(?:"?(\w+)"?\.)?"?(\w+)"?`; // [schema.]name, optionally quoted

const stripComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const inPublic = (schema) => !schema || schema.toLowerCase() === "public";

/** Tables created in schema public: Map<name, file> (first file that creates it). */
export function createdTables(sources) {
  const re = new RegExp(String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${IDENT}`, "gi");
  const out = new Map();
  for (const { file, sql } of sources) {
    for (const m of stripComments(sql).matchAll(re)) {
      const [, schema, name] = m;
      if (inPublic(schema) && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), file);
    }
  }
  return out;
}

/** Tables with `enable row level security` in schema public: Set<name>. */
export function rlsEnabledTables(sources) {
  const re = new RegExp(
    String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}\s+enable\s+row\s+level\s+security`,
    "gi",
  );
  const out = new Set();
  for (const { sql } of sources) {
    for (const m of stripComments(sql).matchAll(re)) {
      const [, schema, name] = m;
      if (inPublic(schema)) out.add(name.toLowerCase());
    }
  }
  return out;
}

/** [{ table, file }] for every public table missing RLS. */
export function findTablesWithoutRls(sources) {
  const rls = rlsEnabledTables(sources);
  return [...createdTables(sources)]
    .filter(([name]) => !rls.has(name))
    .map(([table, file]) => ({ table, file }));
}

export function loadSources(webRoot) {
  const dbDir = join(webRoot, "db");
  const migDir = join(dbDir, "migrations");
  const files = [
    join(dbDir, "schema.sql"),
    ...readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(migDir, f)),
  ];
  return files.map((f) => ({ file: relative(webRoot, f).split(sep).join("/"), sql: readFileSync(f, "utf8") }));
}

function main() {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sources = loadSources(webRoot);
  const missing = findTablesWithoutRls(sources);
  const total = createdTables(sources).size;
  if (missing.length) {
    console.error(`check-rls: ${missing.length} public table(s) without "enable row level security":`);
    for (const { table, file } of missing) console.error(`  - ${table}  (created in ${file})`);
    console.error("Add `alter table <name> enable row level security;` in a migration and in db/schema.sql.");
    process.exit(1);
  }
  console.log(`check-rls: OK — all ${total} public tables enable RLS (${sources.length} SQL files scanned).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
