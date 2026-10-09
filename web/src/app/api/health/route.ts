// GET /api/health — public, cheap liveness + schema-drift check.
//
// 200 {ok:true}  when the live DB has every migration this build was made with.
// 503 {ok:false} when the DB is behind (a migration never pasted into the SQL
//                editor), when public.schema_migrations is missing (DB predates
//                010 → behind by definition), or when the DB is unreachable.
// Deliberately exposes only migration numbers and one `configured` flag — no
// per-secret booleans, no error text. Curled after every Vercel deploy by
// .github/workflows/post-deploy-health.yml.
import { createServiceClient } from "@/lib/supabase/service";
import { compareSchema, isMissingTableError, parseVersionList, type SchemaCheck } from "@/lib/schema-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // must hit the DB on every request, never prerendered

const DB_TIMEOUT_MS = 5000;

export async function GET() {
  const expected = parseVersionList(process.env.EXPECTED_SCHEMA_VERSIONS);
  const supabaseReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const configured =
    supabaseReady && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.ANTHROPIC_API_KEY);

  if (!supabaseReady) {
    // Local demo without keys: nothing to check against. In production a missing
    // DB config is itself an outage.
    const isProd = process.env.VERCEL_ENV === "production";
    return json(isProd ? 503 : 200, {
      ok: !isProd,
      configured,
      schema: { expected: expected.at(-1) ?? null, actual: null, status: "skipped" },
    });
  }

  const schema = await checkSchema(expected);
  return json(schema.ok ? 200 : 503, {
    ok: schema.ok,
    configured,
    schema: {
      expected: schema.expected,
      actual: schema.actual,
      status: schema.status,
      ...(schema.missing.length ? { missing: schema.missing } : {}),
    },
  });
}

async function checkSchema(expected: string[]): Promise<SchemaCheck> {
  try {
    const { data, error } = await createServiceClient()
      .from("schema_migrations")
      .select("version")
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) {
      if (isMissingTableError(error)) return compareSchema(expected, null);
      return unreachable(expected);
    }
    return compareSchema(
      expected,
      (data ?? []).map((r) => r.version as string),
    );
  } catch {
    return unreachable(expected);
  }
}

function unreachable(expected: string[]): SchemaCheck {
  return { ok: false, status: "unreachable", expected: expected.at(-1) ?? null, actual: null, missing: [] };
}

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
