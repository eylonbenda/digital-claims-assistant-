import { createClient } from "@/lib/supabase/server";
import { summarizeFunnel, type FunnelRow } from "@/lib/collection/funnel";

// GET /api/reports/funnel?days=90
//
// The wizard funnel for the signed-in agent: links sent, completions, and where the
// abandoned ones stopped. Reads existing rows only — no instrumentation, no new
// table, no migration. Answers the open remainder on C1 (abandonment rate was never
// measured) and, via the deferral counts, C2 (can clients actually photograph their
// documents) — see docs/assumptions-canvas.md.
//
// Deliberately JSON and not a dashboard panel: the operator asked for a *simpler*
// screen, and this is a number the agent reads occasionally, not daily.
//
// Scoped by RLS through the user's own client, so an agent only ever sees their own
// claims — no service client here.

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_DAYS) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("claims")
    .select("id, created_at, submitted_at, summary_json")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    window_days: days,
    since,
    ...summarizeFunnel((data ?? []) as FunnelRow[]),
  });
}
