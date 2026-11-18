import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientNameLabel } from "@/lib/dashboard/copy";
import { EMAIL_COPY as C } from "@/lib/email/copy";
import { loadUnmatched } from "@/lib/email/load";
import AssignClaim, { type AssignableClaim } from "./AssignClaim";
import EmailCard from "./EmailCard";

// Mail that arrived at the business's system address and could not be filed on a
// claim automatically. Filing it by hand is the only action here; a message that
// is on a claim is read on that claim's page.
export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const emails = await loadUnmatched(supabase);

  // Candidates for filing: the business's open claims (RLS-scoped), newest first.
  let claims: AssignableClaim[] = [];
  if (emails?.length) {
    const [{ data: claimRows }, { data: tpRows }] = await Promise.all([
      supabase
        .from("claims")
        .select("id, client_name, status, client_plate:summary_json->collected->vehicle->>plate")
        .not("status", "in", "(closed,abandoned)")
        .order("created_at", { ascending: false }),
      supabase.from("third_parties").select("claim_id, plate"),
    ]);
    const tpBy = new Map<string, string[]>();
    for (const t of tpRows ?? []) {
      if (t.plate) tpBy.set(t.claim_id, [...(tpBy.get(t.claim_id) ?? []), t.plate]);
    }
    claims = (claimRows ?? []).map((c) => ({
      id: c.id as string,
      name: clientNameLabel(c.client_name as string | null),
      plates: [c.client_plate as string | null, ...(tpBy.get(c.id as string) ?? [])].filter(
        (p): p is string => !!p,
      ),
    }));
  }

  // Server Component renders once per request, so one clock read is stable for this render.
  const now = new Date();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{C.inboxTitle}</h1>
        <p className="mt-1 text-sm text-muted">{C.inboxSubtitle}</p>
      </div>

      {emails &&
        (emails.length === 0 ? (
          <p className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            {C.inboxEmpty}
          </p>
        ) : (
          <ul className="space-y-3">
            {emails.map((e) => (
              <EmailCard key={e.id} email={e} now={now}>
                <AssignClaim emailId={e.id} claims={claims} />
              </EmailCard>
            ))}
          </ul>
        ))}
    </main>
  );
}
