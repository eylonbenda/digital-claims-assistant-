import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sniffFileType, SNIFF_MIME, SNIFF_EXT } from "@/lib/files/sniff";
import { runEngine } from "@/lib/tasks/runner";
import { reportError, serverError } from "@/lib/observability/report";
import { detectDocType } from "@/lib/ai/classify-document";
import { AGENT_DOC_TYPES } from "@/lib/claims/agent-doc-types";

export const runtime = "nodejs";
// Auto-filing waits on the classifier (bounded at 20s) before the row is written.
export const maxDuration = 60;

const BUCKET = "claim-docs";
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
    .select("id, status")
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
  const mime = SNIFF_MIME[kind];
  const verdict = auto ? await detectDocType(bytes, kind) : null;
  const type = verdict ? verdict.type : requested;

  const svc = createServiceClient();
  const path = `${id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${SNIFF_EXT[kind]}`;

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return serverError("/api/claims/[id]/documents", upErr, { claimId: id, step: "upload" });
  }

  const { data: doc, error: dbErr } = await svc
    .from("claim_documents")
    .insert({ claim_id: id, type, storage_path: path, mime })
    .select("id")
    .single();
  if (dbErr) {
    await svc.storage.from(BUCKET).remove([path]);
    return serverError("/api/claims/[id]/documents", dbErr, { claimId: id, step: "insert" });
  }

  // Reactive task engine: auto-complete chase tasks this doc satisfies.
  await runEngine(id, { type: "doc_uploaded", docType: type });

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
