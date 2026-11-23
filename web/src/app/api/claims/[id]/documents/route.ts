import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sniffFileType } from "@/lib/files/sniff";
import { storeClaimDocument } from "@/lib/claims/store-document";
import { runEngine } from "@/lib/tasks/runner";
import { reportError, serverError } from "@/lib/observability/report";
import { detectDocType } from "@/lib/ai/classify-document";
import { AGENT_DOC_TYPES } from "@/lib/claims/agent-doc-types";
import { recordDocAmounts, wantsDocAmounts } from "@/lib/demand/suggest-on-file";

export const runtime = "nodejs";
// Auto-filing waits on the classifier (bounded at 20s) before the row is written; an
// appraiser report or fee invoice on a demand claim is then read for its amounts
// (bounded at 25s).
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB — agents upload multi-page PDFs

// Types agents can upload post-intake (wider than the claimant-facing set).
// Shared with the upload UI + asserted to cover the handling evidence gates.
const AGENT_TYPES = AGENT_DOC_TYPES;
const AUTO = "auto";

// POST /api/claims/[id]/documents  (agent-authenticated, session-gated)
// FormData: { type: string | "auto", file: File }
// type "auto": the file is filed under the type the classifier detects, or "other"
// when it cannot tell — detection never fails the upload.
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

  const form = await request.formData().catch(() => null);
  const requested = form?.get("type");
  const file = form?.get("file");

  if (typeof requested !== "string" || !(file instanceof File)) {
    return Response.json({ error: "type and file are required" }, { status: 400 });
  }
  const auto = requested === AUTO;
  if (!auto && !AGENT_TYPES.has(requested)) {
    return Response.json({ error: `invalid document type: ${requested}` }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "file too large (max 20MB)" }, { status: 413 });
  }

  // RLS verify: the auth client's select will return null if this claim doesn't
  // belong to the authenticated agent.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, status, claim_type")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });
  if (claim.status === "closed") {
    return Response.json({ error: "claim is closed" }, { status: 409 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFileType(bytes);
  if (!kind) {
    return Response.json(
      { error: "סוג קובץ לא נתמך — צרפו תמונה (JPG/PNG/HEIC) או PDF" },
      { status: 415 },
    );
  }
  const verdict = auto ? await detectDocType(bytes, kind) : null;
  const type = verdict ? verdict.type : requested;

  const svc = createServiceClient();
  const doc = await storeClaimDocument(svc, id, type, bytes, kind);
  if ("error" in doc) {
    return serverError("/api/claims/[id]/documents", doc.error, { claimId: id, step: doc.step });
  }
  const path = doc.path;

  // Reactive task engine: auto-complete chase tasks this doc satisfies.
  await runEngine(id, { type: "doc_uploaded", docType: type });

  // Offered to the clerk as a suggestion; never written to the damages from here.
  if (wantsDocAmounts(type, claim.claim_type)) {
    await recordDocAmounts(svc, id, doc.id, type, bytes, kind);
  }

  if (verdict) {
    // Kept so corrections (document_retyped) can be measured against detections.
    const { error: evErr } = await svc.from("claim_events").insert({
      claim_id: id,
      type: "document_auto_filed",
      payload_json: { type, detected: verdict.detected },
    });
    if (evErr) await reportError("/api/claims/[id]/documents", evErr, { claimId: id, step: "event" });
  }

  return Response.json({
    ok: true, id: doc.id, type, path,
    ...(verdict ? { detected: verdict.detected } : {}),
  });
}
