// GET /api/version — which build is live. Use it to confirm a deploy landed
// (commit) and which schema it expects (compare with /api/health).
// VERCEL_* are Vercel system env vars; off-Vercel they are unset → "local".
export const dynamic = "force-dynamic";

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return Response.json(
    {
      name: "digital-claims-assistant",
      commit: sha ? sha.slice(0, 7) : "local",
      env: process.env.VERCEL_ENV ?? "local",
      expectedSchema: process.env.EXPECTED_SCHEMA_VERSION ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
