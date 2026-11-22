import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sniffFileType } from "@/lib/files/sniff";
import { storeClaimDocument } from "@/lib/claims/store-document";
import { runEngine } from "@/lib/tasks/runner";
import { serverError } from "@/lib/observability/report";

export const runtime = "nodejs";

const BUCKET = "claim-docs";
const MAX_BYTES = 20 * 1024 * 1024; // same cap as an upload
// Only the documents a handling transition is gated on.
const EVIDENCE_TYPES = new Set(["payment_notice", "rejection_letter"]);

// POST /api/claims/[id]/documents/from-email
// Body: { attachment_id: string, type: "payment_notice" | "rejection_letter" }
// Files a copy of an email attachment as a claim document, so the clerk does not
// download and re-upload the insurer's letter. A copy, not a second reference:
// deleting a claim document removes its object and must not break the email.
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
  const attachmentId = body && typeof body.attachment_id === "string" ? body.attachment_id : null;
  const type = body && typeof body.type === "string" ? body.type : null;
  if (!attachmentId || !type || !EVIDENCE_TYPES.has(type)) {
    return Response.json({ error: "attachment_id and an evidence type are required" }, { status: 400 });
  }

  // All three probes go through the user's client: RLS decides what this user may
  // touch, and the email must be filed on this very claim.
  const { data: claim } = await supabase.from("claims").select("id, status").eq("id", id).maybeSingle();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });
  if (claim.status === "closed") return Response.json({ error: "claim is closed" }, { status: 409 });

  const { data: att } = await supabase
    .from("claim_email_attachments")
    .select("id, email_id, storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!att) return Response.json({ error: "not found" }, { status: 404 });
  const { data: email } = await supabase
    .from("claim_emails").select("id").eq("id", att.email_id).eq("claim_id", id).maybeSingle();
  if (!email) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: blob, error: dlErr } = await svc.storage.from(BUCKET).download(att.storage_path as string);
  if (dlErr || !blob) {
    return Response.json({ error: "הקובץ מהמייל לא נמצא באחסון — צרפו אותו כקובץ אחר" }, { status: 404 });
  }
  if (blob.size > MAX_BYTES) {
    return Response.json({ error: "file too large (max 20MB)" }, { status: 413 });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = sniffFileType(bytes);
  if (!kind) {
    return Response.json(
      { error: "סוג הקובץ שבמייל לא נתמך — צרפו תמונה (JPG/PNG/HEIC) או PDF" },
      { status: 415 },
    );
  }

  const doc = await storeClaimDocument(svc, id, type, bytes, kind);
  if ("error" in doc) {
    return serverError("/api/claims/[id]/documents/from-email", doc.error, { claimId: id, step: doc.step });
  }
  await runEngine(id, { type: "doc_uploaded", docType: type });

  return Response.json({ ok: true, id: doc.id, type });
}
