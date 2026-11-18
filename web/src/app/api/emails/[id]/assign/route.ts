import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverError } from "@/lib/observability/report";

// POST /api/emails/[id]/assign
// Body: { claim_id: string }
// Files an unmatched inbound message on one of the business's claims. Both ids are
// probed through the user's client, so RLS decides what this user may touch; the
// write itself needs the service client (claim_emails has no update policy).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const claimId = body && typeof body.claim_id === "string" ? body.claim_id : null;
  if (!claimId) return Response.json({ error: "claim_id (string) required" }, { status: 400 });

  const { data: email } = await supabase
    .from("claim_emails")
    .select("id, claim_id")
    .eq("id", id)
    .maybeSingle();
  if (!email) return Response.json({ error: "not found" }, { status: 404 });
  if (email.claim_id) return Response.json({ error: "המייל כבר משויך לתיק" }, { status: 409 });

  const { data: claim } = await supabase.from("claims").select("id").eq("id", claimId).maybeSingle();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  // Compare-and-set on "still unfiled": two tabs assigning the same message → 409.
  const svc = createServiceClient();
  const { error, count } = await svc
    .from("claim_emails")
    .update({ claim_id: claimId, match_method: "manual" }, { count: "exact" })
    .eq("id", id)
    .is("claim_id", null);
  if (error) return serverError("/api/emails/[id]/assign", error, { emailId: id, claimId });
  if (!count) return Response.json({ error: "המייל כבר משויך לתיק" }, { status: 409 });

  return Response.json({ ok: true });
}
