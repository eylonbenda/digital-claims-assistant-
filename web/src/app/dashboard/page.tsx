import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import NewClaimForm from "./NewClaimForm";
import ClaimsTable from "./ClaimsTable";
import TodayList from "./TodayList";
import BriefAutoRefresh from "./BriefAutoRefresh";
import { composeDashboard } from "@/lib/dashboard/compose";
import { greeting, hebDate } from "@/lib/dashboard/copy";
import { getOrCreateBrief, warmBriefRanking } from "@/lib/brief/brief";
import { createServiceClient } from "@/lib/supabase/service";
import { loadQueue } from "@/lib/outbound/load";
import type { OutboundQueue as OutboundQueueType } from "@/lib/outbound/queue";

// Bound the post-response window `after()` runs in. The ranking call is ~20-50s
// at a realistic book size; 60s is the ceiling on every Vercel plan, so a very
// large book may not finish warming. That degrades to "stays rules-only and
// retries on the next load" — never to a slow page.
export const maxDuration = 60;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Absolute origin for links baked into rendered HTML (e.g. the WhatsApp
  // message body) — computed server-side so SSR and client hydration match.
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  // Agent row (agents.id ≠ auth uid). No row yet → no claims → no brief.
  // Best-effort: the brief must never break the dashboard, so a missing
  // service key or any lookup failure degrades to no-brief, not a 500.
  let brief = null;
  let queue: OutboundQueueType | null = null;
  // True when this render is showing the rules-only ordering and a ranking is
  // being warmed behind it — drives the one-shot client refresh below.
  let awaitingRanking = false;
  try {
    const svc = createServiceClient();
    const { data: agentRow } = await svc
      .from("agents")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (agentRow) {
      // Never wait on the model here. The AI ranking is a ~20-50s call, and this
      // page has no Suspense boundary, so awaiting it held the entire dashboard
      // HTML — which is what made the first login of each day (the day-cache is
      // keyed on the UTC date, so 03:00 Israel time rolls it over) take ~35s.
      brief = await getOrCreateBrief(agentRow.id, { cachedOnly: true });
      // The queue takes the brief only as an ordering signal — a null brief
      // (AI down / cache broken) must not take the send queue down with it.
      queue = await loadQueue(agentRow.id, origin, brief);
      // Cold cache → fill it after the response is flushed, so this render pays
      // nothing and the next one gets the AI ordering. An empty book has nothing
      // to rank, so don't schedule a warm that would only no-op.
      if (brief && !brief.ai && brief.items.length > 0) {
        const agentId = agentRow.id;
        awaitingRanking = true;
        after(() => warmBriefRanking(agentId));
      }
    }
  } catch {
    brief = null;
    queue = null;
    awaitingRanking = false;
  }

  const { data: claims } = await supabase
    .from("claims")
    .select(
      "id, client_name, client_phone, claim_type, status, urgent, created_at, submitted_at, access_token"
    )
    .order("created_at", { ascending: false });

  // Earliest open task per claim (RLS-scoped). due_at-ascending with nulls
  // last, so row 1 per claim = the next dated action.
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("claim_id, title, status, due_at")
    .neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false });

  const now = new Date();
  const openClaims = (claims ?? []).filter((c) => c.status !== "closed" && c.status !== "abandoned");
  const list = composeDashboard({
    claims: openClaims.map((c) => ({
      id: c.id, client_name: c.client_name, claim_type: c.claim_type,
      status: c.status, submitted_at: c.submitted_at, created_at: c.created_at,
    })),
    queue, brief,
    openTasks: (taskRows ?? []).map((t) => ({ claim_id: t.claim_id, title: t.title, due_at: t.due_at })),
    now,
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900">עוזר התביעות</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {awaitingRanking && <BriefAutoRefresh />}

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">תביעות</h2>
          <NewClaimForm />
        </div>

        <TodayList
          list={list}
          greeting={greeting(now)}
          dateLabel={hebDate(now)}
          name={user.email?.split("@")[0] ?? null}
          claimsCount={(claims ?? []).length}
        />

        <ClaimsTable claims={claims ?? []} />
      </main>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
      >
        התנתקות
      </button>
    </form>
  );
}
