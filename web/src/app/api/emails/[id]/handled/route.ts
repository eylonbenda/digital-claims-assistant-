import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverError } from "@/lib/observability/report";
import { HANDLED_NONE } from "@/lib/email/pending";

// PATCH /api/emails/[id]/handled
// Body: { outcome: "none" }
// The clerk read an inbound email and it changes nothing about the claim's status.
// (An email that does change it is marked by PATCH /api/claims/[id]/handling.)
export async function PATCH(
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
  if (!body || body.outcome !== HANDLED_NONE) {
    return Response.json({ error: 'outcome "none" required' }, { status: 400 });
  }

  // RLS probe: null when the message is not this business's.
  const { data: email } = await supabase
    .from("claim_emails")
    .select("id, claim_id, direction")
    .eq("id", id)
    .maybeSingle();
  if (!email || !email.claim_id || email.direction !== "inbound") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Compare-and-set on "still unhandled": a status set from this email in another
  // tab is never overwritten with "none".
  const svc = createServiceClient();
  const { error } = await svc
    .from("claim_emails")
    .update({ handled_at: new Date().toISOString(), handled_as: HANDLED_NONE })
    .eq("id", id)
    .is("handled_at", null);
  if (error) return serverError("/api/emails/[id]/handled", error, { emailId: id });

  return Response.json({ ok: true });
}
