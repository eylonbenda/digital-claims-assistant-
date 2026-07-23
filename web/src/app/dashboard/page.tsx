import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import NewClaimForm from "./NewClaimForm";
import ClaimsTable from "./ClaimsTable";
import MorningBrief from "./MorningBrief";
import { getOrCreateBrief } from "@/lib/brief/brief";
import { createServiceClient } from "@/lib/supabase/service";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Agent row (agents.id ≠ auth uid). No row yet → no claims → no brief.
  const svc = createServiceClient();
  const { data: agentRow } = await svc
    .from("agents")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const brief = agentRow ? await getOrCreateBrief(agentRow.id) : null;

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
    .select("id, claim_id, key, title, status, due_at")
    .neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false });

  const nextTaskByClaim = new Map<string, { title: string; due_at: string | null }>();
  for (const t of taskRows ?? []) {
    if (!nextTaskByClaim.has(t.claim_id)) {
      nextTaskByClaim.set(t.claim_id, { title: t.title, due_at: t.due_at });
    }
  }
  const claimsWithTasks = (claims ?? []).map((c) => ({
    ...c,
    next_task: nextTaskByClaim.get(c.id) ?? null,
  }));

  // Absolute origin for links baked into rendered HTML (e.g. the WhatsApp
  // message body) — computed server-side so SSR and client hydration match.
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

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

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">תביעות</h2>
          <NewClaimForm />
        </div>

        {brief && <MorningBrief brief={brief} origin={origin} />}

        <ClaimsTable claims={claimsWithTasks} />
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
