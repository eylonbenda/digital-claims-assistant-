import type { SupabaseClient } from "@supabase/supabase-js";
import { SNIFF_EXT, SNIFF_MIME, type SniffKind } from "@/lib/files/sniff";

const BUCKET = "claim-docs";

export type StoredDocument =
  | { id: string; path: string }
  | { error: { message: string }; step: "upload" | "insert" };

// Writes one file under the claim's documents and records it. Used by the upload
// route and by "file this email attachment as evidence": both must end with the
// same row shape and the same path convention. No orphan object on a failed insert.
export async function storeClaimDocument(
  svc: SupabaseClient,
  claimId: string,
  type: string,
  bytes: Uint8Array,
  kind: SniffKind,
): Promise<StoredDocument> {
  const mime = SNIFF_MIME[kind];
  const path = `${claimId}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${SNIFF_EXT[kind]}`;

  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) return { error: upErr, step: "upload" };

  const { data: doc, error: dbErr } = await svc
    .from("claim_documents")
    .insert({ claim_id: claimId, type, storage_path: path, mime })
    .select("id")
    .single();
  if (dbErr) {
    await svc.storage.from(BUCKET).remove([path]);
    return { error: dbErr, step: "insert" };
  }
  return { id: doc.id as string, path };
}
