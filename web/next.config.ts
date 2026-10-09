import type { NextConfig } from "next";
import { readdirSync } from "node:fs";
import path from "node:path";

// Schema drift check: bake the migration numbers this build was made with into
// the bundle, so /api/health can compare them to public.schema_migrations in the
// live DB (see src/lib/schema-version.ts). Read at build time from the repo
// checkout — on Vercel web/db/migrations is part of the checkout (root dir = web).
// Fails the build loudly rather than shipping a health check that checks nothing.
const migrationVersions = readdirSync(path.join(__dirname, "db", "migrations"))
  .map((f) => /^(\d+)_.*\.sql$/.exec(f)?.[1])
  .filter((v): v is string => Boolean(v))
  .sort((a, b) => Number(a) - Number(b));
if (migrationVersions.length === 0) {
  throw new Error("next.config: no web/db/migrations/NNN_*.sql found — cannot derive EXPECTED_SCHEMA_VERSION");
}

const nextConfig: NextConfig = {
  env: {
    EXPECTED_SCHEMA_VERSIONS: migrationVersions.join(","),
    EXPECTED_SCHEMA_VERSION: migrationVersions[migrationVersions.length - 1],
  },
  // Bundle the form-fill assets (blank template PDFs + Hebrew font) into the
  // serverless functions that fill forms, so they work when deployed.
  outputFileTracingIncludes: {
    "/api/claims/[id]/form/[insurer]": ["./src/lib/formfill/assets/**"],
    "/api/claims/submit": ["./src/lib/formfill/assets/**"],
  },
};

export default nextConfig;
