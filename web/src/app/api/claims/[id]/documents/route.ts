import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sniffFileType, SNIFF_MIME, SNIFF_EXT } from "@/lib/files/sniff";
import { runEngine } from "@/lib/tasks/runner";

export const runtime = "nodejs";

const BUCKET = "claim-docs";
const MAX_BYTES = 20 * 1024 * 1024; // 20MB — agents upload multi-page PDFs

// Types agents can upload post-intake (wider than the claimant-facing set).
const AGENT_TYPES = new Set([
  "appraiser_report",
  "garage_invoice",
  "repair_receipt",
  "assessor_fee_invoice",
  "assessor_fee_receipt",
  "no_claim_confirmation",
  "loss_confirmation",
  "bank_details",
  "demand_form",
  "police_report",
  "insurance_history",
  "lien_release",
  "info_consent",
  "power_of_attorney",
  "vat_offset_confirmation",
  "keys",
  "id_card",
  "third_party_doc",
  "car_photo",
  "drivers_license",
  "vehicle_reg",
  "other",
]);

// POST /api/claims/[id]/documents  (agent-authenticated, session-gated)
// FormData: { type: string, file: File }
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
  const type = form?.get("type");
  const file = form?.get("file");

  if (typeof type !== "string" || !(file instanceof File)) {
    return Response.json({ error: "type and file are required" }, { status: 400 });
  }
  if (!AGENT_TYPES.has(type)) {
    return Response.json({ error: `invalid document type: ${type}` }, { status: 400 });
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

  const svc = createServiceClient();
  const path = `${id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${SNIFF_EXT[kind]}`;

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return Response.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: doc, error: dbErr } = await svc
    .from("claim_documents")
    .insert({ claim_id: id, type, storage_path: path, mime })
    .select("id")
    .single();
  if (dbErr) {
    await svc.storage.from(BUCKET).remove([path]);
    return Response.json({ error: `could not record document: ${dbErr.message}` }, { status: 500 });
  }

  // Reactive task engine: auto-complete chase tasks this doc satisfies.
  await runEngine(id, { type: "doc_uploaded", docType: type });

  return Response.json({ ok: true, id: doc.id, type, path });
}
