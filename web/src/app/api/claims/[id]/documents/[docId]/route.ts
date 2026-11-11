import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";
import { reportError, serverError } from "@/lib/observability/report";
import { AGENT_DOC_TYPES } from "@/lib/claims/agent-doc-types";

export const runtime = "nodejs";

const BUCKET = "claim-docs";
const ROUTE = "/api/claims/[id]/documents/[docId]";

type Ctx = { params: Promise<{ id: string; docId: string }> };

// Loads the document through the auth client, so RLS (claim_belongs_to_me) is the
// ownership check: another agent's document reads as not found.
async function loadOwned(id: string, docId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };

  const { data: claim } = await supabase
    .from("claims")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!claim) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  if (claim.status === "closed") {
    return { error: Response.json({ error: "claim is closed" }, { status: 409 }) };
  }

  const { data: doc } = await supabase
    .from("claim_documents")
    .select("id, type, storage_path")
    .eq("id", docId)
    .eq("claim_id", id)
    .single();
  if (!doc) return { error: Response.json({ error: "not found" }, { status: 404 }) };

  return { doc };
}

// DELETE /api/claims/[id]/documents/[docId] — remove a file uploaded by mistake
// (by the agent or the client). Row first, then the Storage object: a failed
// object delete leaves an orphan blob nobody can reach, never a row pointing at
// nothing. The checklist is computed live from the rows, so the item flips back to
// missing on the next render. The task engine is forward-only — a chase task
// already completed by this doc stays done.
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, docId } = await params;
  const owned = await loadOwned(id, docId);
  if (owned.error) return owned.error;
  const { doc } = owned;

  const svc = createServiceClient();
  const { error: delErr } = await svc.from("claim_documents").delete().eq("id", doc.id);
  if (delErr) return serverError(ROUTE, delErr, { claimId: id, step: "delete row" });

  const { error: rmErr } = await svc.storage.from(BUCKET).remove([doc.storage_path]);
  if (rmErr) await reportError(ROUTE, rmErr, { claimId: id, step: "remove object" });

  const { error: evErr } = await svc.from("claim_events").insert({
    claim_id: id,
    type: "document_deleted",
    payload_json: { type: doc.type },
  });
  if (evErr) await reportError(ROUTE, evErr, { claimId: id, step: "event" });

  return Response.json({ ok: true });
}

// PATCH /api/claims/[id]/documents/[docId]  { type } — re-file a document under the
// right type (e.g. a vehicle registration uploaded as the driving licence). The
// Storage path keeps the original type segment; nothing reads type from the path.
export async function PATCH(request: Request, { params }: Ctx) {
  const { id, docId } = await params;
  const body = (await request.json().catch(() => null)) as { type?: unknown } | null;
  const type = body?.type;
  if (typeof type !== "string" || !AGENT_DOC_TYPES.has(type)) {
    return Response.json({ error: `invalid document type: ${String(type)}` }, { status: 400 });
  }

  const owned = await loadOwned(id, docId);
  if (owned.error) return owned.error;
  const { doc } = owned;
  if (doc.type === type) return Response.json({ ok: true, type });

  const svc = createServiceClient();
  const { error: upErr } = await svc.from("claim_documents").update({ type }).eq("id", doc.id);
  if (upErr) return serverError(ROUTE, upErr, { claimId: id, step: "update type" });

  const { error: evErr } = await svc.from("claim_events").insert({
    claim_id: id,
    type: "document_retyped",
    payload_json: { from: doc.type, to: type },
  });
  if (evErr) await reportError(ROUTE, evErr, { claimId: id, step: "event" });

  // The doc now satisfies its new type — let the engine complete what it covers.
  await runEngine(id, { type: "doc_uploaded", docType: type });

  return Response.json({ ok: true, type });
}
