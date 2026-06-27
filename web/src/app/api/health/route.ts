// Config health check — works without any keys; reports what's wired.
export async function GET() {
  return Response.json({
    ok: true,
    service: "digital-claims-assistant",
    config: {
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}
