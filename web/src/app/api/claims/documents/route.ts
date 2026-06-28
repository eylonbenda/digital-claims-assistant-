import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs"; // needs the service client + Storage upload

const BUCKET = "claim-docs";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB safety cap (images are compressed client-side first)

// Claimant-facing subset of the doc_type enum. Prevents a client from writing agent-only types.
const ALLOWED_TYPES = new Set(["car_photo", "drivers_license", "vehicle_reg", "third_party_doc"]);

const TERMINAL_STATUSES = new Set([
  "submitted",
  "classified",
  "form_generated",
  "checklist_active",
  "closed",
]);

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
  if (TERMINAL_STATUSES.has(claim.status)) {
    return Response.json({ error: "already submitted" }, { status: 409 });
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${claim.id}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) {
    return Response.json({ error: `upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: doc, error: dbErr } = await svc
    .from("claim_documents")
    .insert({ claim_id: claim.id, type, storage_path: path, mime: file.type || null })
    .select("id")
    .single();
  if (dbErr) {
    await svc.storage.from(BUCKET).remove([path]); // don't leave an orphaned object
    return Response.json({ error: `could not record document: ${dbErr.message}` }, { status: 500 });
  }

  return Response.json({ ok: true, id: doc.id, type, path });
}
