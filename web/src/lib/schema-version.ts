// Schema drift check — pure logic behind /api/health.
//
// Migrations are pasted into Supabase by hand; deploy ships code, not schema.
// The build bakes the migration numbers it was built with into
// EXPECTED_SCHEMA_VERSIONS (next.config.ts, from web/db/migrations/NNN_*.sql);
// the database records what it has run in public.schema_migrations (migration 010).
// Health = every expected version is present in the DB. A DB *ahead* of the code
// is fine (the paste-before-merge window); a DB missing any version is not —
// including a gap below the max (e.g. 011 skipped, 012 applied).

export type SchemaStatus = "ok" | "behind" | "missing_table" | "unreachable";

export interface SchemaCheck {
  ok: boolean;
  status: SchemaStatus;
  expected: string | null; // highest migration the build knows about
  actual: string | null; // highest migration the DB has recorded
  missing: string[]; // expected versions the DB has not recorded (status "behind" only)
}

/** "001,002,010" → ["001","002","010"], sorted, de-duplicated, blanks dropped. */
export function parseVersionList(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))].sort(byNumber);
}

function byNumber(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}

function highest(versions: string[]): string | null {
  return versions.length ? [...versions].sort(byNumber)[versions.length - 1] : null;
}

/**
 * `applied` is the DB's schema_migrations versions, or null when the table does
 * not exist (which itself means the DB predates migration 010 → behind).
 */
export function compareSchema(expected: string[], applied: string[] | null): SchemaCheck {
  const exp = highest(expected);
  if (applied === null) {
    return { ok: false, status: "missing_table", expected: exp, actual: null, missing: [] };
  }
  const have = new Set(applied.map(Number));
  const missing = expected.filter((v) => !have.has(Number(v)));
  return {
    ok: missing.length === 0,
    status: missing.length === 0 ? "ok" : "behind",
    expected: exp,
    actual: highest(applied),
    missing,
  };
}

/** PostgREST / Postgres codes for "relation does not exist". */
export function isMissingTableError(err: { code?: string | null } | null | undefined): boolean {
  return err?.code === "PGRST205" || err?.code === "42P01";
}
