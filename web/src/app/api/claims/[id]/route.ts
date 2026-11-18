import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DELETE_BLOCKED_MESSAGE, deleteBlocker } from "@/lib/claims/delete";
import { reportError, serverError } from "@/lib/observability/report";
import { isMissingTableError } from "@/lib/schema-version";
import type { ClaimType } from "@/lib/tasks/types";

export const runtime = "nodejs";

const BUCKET = "claim-docs";
const ROUTE = "/api/claims/[id]";

// DELETE /api/claims/[id] — permanently remove a claim opened by mistake.
// Spec: docs/superpowers/specs/2026-11-18-delete-claim-design.md
//
// Only while the claim never reached the insurer (deleteBlocker); after that it is
// closed with a reason instead. Every child table cascades from claims; Storage does
// not, so the file paths are collected first and removed after the row is gone — a
// failed removal leaves orphan blobs nobody can reach, never rows pointing at nothing.
// Emails filed on the claim are kept: claim_emails.claim_id is ON DELETE SET NULL, so
// inbound mail returns to the inbox as unfiled.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS probe: the auth-scoped select returns null for a claim the agent doesn't own.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, handling_status, checklist_state, claim_type")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  // Until migration 013 is applied there is no claim_emails table, hence no emails.
  // Any other read failure must not wave the guard through.
  const { count: outbound, error: emailErr } = await supabase
    .from("claim_emails")
    .select("id", { count: "exact", head: true })
    .eq("claim_id", id)
    .eq("direction", "outbound");
  if (emailErr && !isMissingTableError(emailErr)) {
    return serverError(ROUTE, emailErr, { claimId: id, step: "read emails" });
  }

  const blocker = deleteBlocker({
    handlingStatus: (claim.handling_status as string | null) ?? null,
    checklistState: (claim.checklist_state as Record<string, boolean> | null) ?? {},
    claimType: claim.claim_type as ClaimType,
    hasOutboundEmail: (outbound ?? 0) > 0,
  });
  if (blocker) return Response.json({ error: DELETE_BLOCKED_MESSAGE[blocker] }, { status: 409 });

  const svc = createServiceClient();
  const [docs, forms] = await Promise.all([
    svc.from("claim_documents").select("storage_path").eq("claim_id", id),
    svc.from("generated_forms").select("storage_path").eq("claim_id", id),
  ]);
  const pathsErr = docs.error ?? forms.error;
  // Deleting without the paths would orphan the files (ID / licence photos) for good.
  if (pathsErr) return serverError(ROUTE, pathsErr, { claimId: id, step: "read paths" });
  const paths = [...(docs.data ?? []), ...(forms.data ?? [])].map((r) => r.storage_path as string);

  // Compare-and-set on the status the guard saw: a send that lands in between makes
  // this match 0 rows, and the claim survives.
  const { error: delErr, count } = await svc
    .from("claims")
    .delete({ count: "exact" })
    .eq("id", id)
    .is("handling_status", null);
  if (delErr) return serverError(ROUTE, delErr, { claimId: id, step: "delete row" });
  if (!count) return Response.json({ error: DELETE_BLOCKED_MESSAGE.sent }, { status: 409 });

  if (paths.length) {
    const { error: rmErr } = await svc.storage.from(BUCKET).remove(paths);
    if (rmErr) await reportError(ROUTE, rmErr, { claimId: id, step: "remove objects", files: paths.length });
  }

  // claim_events cascaded away with the claim — this line is the only trace. Ids only.
  console.info(JSON.stringify({ event: "claim_deleted", claimId: id, files: paths.length }));

  return Response.json({ ok: true });
}
