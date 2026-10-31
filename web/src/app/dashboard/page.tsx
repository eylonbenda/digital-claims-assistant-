import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import NewClaimForm from "./NewClaimForm";
import ClaimsList from "./ClaimsList";
import BriefAutoRefresh from "./BriefAutoRefresh";
import { composeDashboard } from "@/lib/dashboard/compose";
import RefreshOnFocus from "./RefreshOnFocus";
import type { DraftLite } from "@/lib/dashboard/copy";
import { greeting, hebDate } from "@/lib/dashboard/copy";
import { effectiveHandling } from "@/lib/handling/effective";
import { INSURER_DIRECTORY } from "@/lib/submission/directory";
import { parsePage } from "@/lib/dashboard/paginate";
import { parseStageFilter } from "@/lib/dashboard/list";
import { briefEnabled } from "@/lib/dashboard/flags";
import { getOrCreateBrief, warmBriefRanking } from "@/lib/brief/brief";
import { createServiceClient } from "@/lib/supabase/service";
import { loadQueue } from "@/lib/outbound/load";
import type { OutboundQueue as OutboundQueueType } from "@/lib/outbound/queue";

// Bound the post-response window `after()` runs in. The ranking call is ~20-50s
// at a realistic book size; 60s is the ceiling on every Vercel plan, so a very
// large book may not finish warming. That degrades to "stays rules-only and
// retries on the next load" — never to a slow page. Only reached with the brief
// enabled; with it off nothing runs after the response.
export const maxDuration = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[]; stage?: string | string[] }>;
}) {
  const { p, stage } = await searchParams;
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
  const showBrief = briefEnabled();
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
      // Brief off (the default): no model call, no day-cache read, no after().
      // The queue still loads — it takes the brief purely as an ordering hint and
      // already treats null as "no signal".
      if (!showBrief) {
        queue = await loadQueue(agentRow.id, origin, null);
      } else {
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
    }
  } catch {
    brief = null;
    queue = null;
    awaitingRanking = false;
  }

  const { data: claims } = await supabase
    .from("claims")
    .select(
      "id, client_name, client_phone, claim_type, status, urgent, created_at, submitted_at, access_token, handling_status, handling_status_changed_at, checklist_state, policy_insurer, at_fault_insurer, draft:summary_json->draft, client_plate:summary_json->collected->vehicle->>plate"
    )
    .order("created_at", { ascending: false });

  // Earliest open task per claim (RLS-scoped). due_at-ascending with nulls
  // last, so row 1 per claim = the next dated action.
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("claim_id, title, status, due_at")
    .neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false });

  // Newest upload per claim (RLS-scoped) — orders the list by activity and marks a
  // document that arrived after submit.
  const { data: docRows } = await supabase
    .from("claim_documents")
    .select("claim_id, uploaded_at")
    .order("uploaded_at", { ascending: false });
  const lastUploadBy = new Map<string, string>();
  for (const d of docRows ?? []) if (!lastUploadBy.has(d.claim_id)) lastUploadBy.set(d.claim_id, d.uploaded_at);

  // Third-party vehicle plates per claim (RLS-scoped) — searchable from the list.
  const { data: tpRows } = await supabase.from("third_parties").select("claim_id, plate");
  const tpPlatesBy = new Map<string, string[]>();
  for (const t of tpRows ?? []) {
    if (!t.plate) continue;
    const arr = tpPlatesBy.get(t.claim_id) ?? [];
    arr.push(t.plate);
    tpPlatesBy.set(t.claim_id, arr);
  }

  const now = new Date();
  const rows = composeDashboard({
    claims: (claims ?? []).map((c) => ({
      id: c.id, client_name: c.client_name, claim_type: c.claim_type,
      status: c.status, submitted_at: c.submitted_at, created_at: c.created_at,
      // Only the draft is pulled (JSON path select), not the whole summary_json.
      draft: c.draft as DraftLite,
      last_upload_at: lastUploadBy.get(c.id) ?? null,
      phone: c.client_phone, urgent: c.urgent, access_token: c.access_token,
      client_plate: (c.client_plate as string | null) ?? null,
      tp_plates: tpPlatesBy.get(c.id) ?? [],
      handling_changed_at: c.handling_status_changed_at,
      ...(() => {
        const effective = effectiveHandling(
          c.handling_status,
          (c.checklist_state as Record<string, boolean> | null) ?? {},
          c.claim_type,
        );
        const insurerKey = c.claim_type === "own_policy" ? c.policy_insurer : c.at_fault_insurer;
        return {
          handling_effective: effective,
          handling_insurer_label: insurerKey
            ? (INSURER_DIRECTORY[insurerKey]?.label ?? insurerKey)
            : null,
          handling_days: c.handling_status_changed_at
            ? Math.max(
                0,
                Math.floor(
                  (now.getTime() - new Date(c.handling_status_changed_at).getTime()) / 86_400_000,
                ),
              )
            : 0,
        };
      })(),
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

      {showBrief && awaitingRanking && <BriefAutoRefresh />}
      <RefreshOnFocus />

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">תביעות</h2>
          <NewClaimForm />
        </div>

        <ClaimsList
          rows={rows}
          greeting={greeting(now)}
          dateLabel={hebDate(now)}
          nowIso={now.toISOString()}
          name={user.email?.split("@")[0] ?? null}
          initialPage={parsePage(p)}
          initialStage={parseStageFilter(stage)}
        />
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
