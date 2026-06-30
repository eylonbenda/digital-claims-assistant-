import { createServiceClient } from "@/lib/supabase/service";
import { sniffFileType, SNIFF_MIME, SNIFF_EXT } from "@/lib/files/sniff";

export const runtime = "nodejs"; // needs the service client + Storage upload

const BUCKET = "claim-docs";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB safety cap (images are compressed client-side first)

// Claimant-facing subset of the doc_type enum. Prevents a client from writing agent-only types.
const ALLOWED_TYPES = new Set(["car_photo", "drivers_license", "vehicle_reg", "third_party_doc"]);

// Uploads are accepted right up until the claim is closed — clients routinely add
// documents after the initial submit (the agent asks for more, or they forgot one).
const UPLOAD_BLOCKED_STATUSES = new Set(["closed"]);

// POST multipart { token, type, file } -> uploads to private Storage + inserts a claim_documents row.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const type = form?.get("type");
  const file = form?.get("file");

  if (typeof token !== "string" || typeof type !== "string" || !(file instanceof File)) {
    return Response.json({ error: "token, type and file are required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(type)) {
    return Response.json({ error: `invalid document type: ${type}` }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "file too large (max 8MB)" }, { status: 413 });
  }

  // Magic-byte sniff — the client-declared MIME is untrusted. Reject anything that isn't a real
  // photo or PDF (screenshots-as-text, mislabeled binaries, etc.), and store the *detected* type.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFileType(bytes);
  if (!kind) {
    return Response.json(
      { error: "סוג קובץ לא נתמך — צרפו תמונה (JPG/PNG/HEIC) או PDF" },
      { status: 415 }
    );
  }
  const mime = SNIFF_MIME[kind];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Supabase not configured — succeed silently so the wizard works in demo mode (no real upload).
    return Response.json({ ok: true, demo: true });
  }

  const svc = createServiceClient();

  const { data: claim } = await svc
    .from("claims")
    .select("id, status")
    .eq("access_token", token)
    .single();

  if (!claim) return Response.json({ error: "invalid token" }, { status: 404 });
  if (UPLOAD_BLOCKED_STATUSES.has(claim.status)) {
    return Response.json({ error: "claim is closed" }, { status: 409 });
  }
  const isLateUpload = claim.status !== "created" && claim.status !== "in_progress";

  const path = `${claim.id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${SNIFF_EXT[kind]}`;

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return Response.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: doc, error: dbErr } = await svc
    .from("claim_documents")
    .insert({ claim_id: claim.id, type, storage_path: path, mime })
    .select("id")
    .single();
  if (dbErr) {
    await svc.storage.from(BUCKET).remove([path]); // don't leave an orphaned object
    return Response.json({ error: `could not record document: ${dbErr.message}` }, { status: 500 });
  }

  // Surface late uploads in the audit log so the agent notices documents added
  // after the claim was already submitted.
  if (isLateUpload) {
    await svc.from("claim_events").insert({
      claim_id: claim.id,
      type: "document_uploaded",
      payload_json: { type, after_submit: true },
    });
  }

  return Response.json({ ok: true, id: doc.id, type, path });
}
