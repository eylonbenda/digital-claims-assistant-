import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ClaimData } from "@/lib/formfill/types";

// PATCH /api/claims/[id]/form-data
// Body: { form_data: ClaimData }
// The agent's corrected/completed canonical claim data used to fill the accident-notice
// form. Stored in summary_json.form_data; the original summary_json.collected (the client's
// submission) is left untouched for audit. The form routes fill from form_data when present.
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
  const formData = body?.form_data as ClaimData | undefined;
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) {
    return Response.json({ error: "form_data object required" }, { status: 400 });
  }

  // RLS verify ownership + read current summary_json so we merge instead of clobber.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, summary_json")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const summary = (claim.summary_json as Record<string, unknown> | null) ?? {};

  const svc = createServiceClient();
  const { error } = await svc
    .from("claims")
    .update({ summary_json: { ...summary, form_data: formData } })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "form_data_edited",
    payload_json: { by: user.email ?? null },
  });

  return Response.json({ ok: true });
}
