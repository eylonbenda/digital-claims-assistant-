import CollectionWizard from "@/components/collection/CollectionWizard";
import FollowupUpload from "@/components/collection/FollowupUpload";
import { createServiceClient } from "@/lib/supabase/service";

// The claim was submitted, but the client can still add documents until it's closed.
const SUBMITTED_STATUSES = new Set([
  "submitted",
  "classified",
  "form_generated",
  "checklist_active",
]);

export default async function CollectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // No Supabase configured → demo/dev mode: render wizard without token validation.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return <CollectionWizard token={token} />;
  }

  const svc = createServiceClient();
  const { data: claim } = await svc
    .from("claims")
    .select("id, status, client_phone")
    .eq("access_token", token)
    .single();

  if (!claim) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="text-5xl">❌</div>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">קישור לא תקף</h1>
        <p className="mt-2 text-zinc-500">הקישור שגוי, פג תוקפו, או כבר נעשה בו שימוש.</p>
      </div>
    );
  }

  if (claim.status === "closed") {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">התביעה טופלה</h1>
        <p className="mt-2 text-zinc-500">תודה! הסוכן סיים לטפל בתביעה זו.</p>
      </div>
    );
  }

  if (SUBMITTED_STATUSES.has(claim.status)) {
    // Already submitted — let the client add documents they didn't include the first time.
    const { data: existing } = await svc
      .from("claim_documents")
      .select("type")
      .eq("claim_id", claim.id);
    const existingCounts: Record<string, number> = {};
    for (const d of existing ?? []) {
      existingCounts[d.type] = (existingCounts[d.type] ?? 0) + 1;
    }
    return <FollowupUpload token={token} existingCounts={existingCounts} />;
  }

  const prefill = claim.client_phone
    ? { insured: { mobile: claim.client_phone } }
    : undefined;

  return <CollectionWizard token={token} prefill={prefill} />;
}
