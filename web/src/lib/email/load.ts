import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isMissingTableError } from "@/lib/schema-version";
import { emailConfig } from "./config";
import type { EmailKind } from "./types";

const BUCKET = "claim-docs";
const SIGNED_TTL = 60 * 60; // 1h — same as the claim page's documents
const MIGRATION_HINT = "Check that migration 013_claim_emails.sql has been applied to this database.";

export type EmailRow = {
  id: string;
  kind: EmailKind;
  direction: "outbound" | "inbound";
  delivery_failed: boolean;
  from_addr: string;
  to_addrs: string[];
  subject: string;
  text_body: string | null;
  received_at: string;
  attachments_dropped: boolean;
  // What the clerk decided about an inbound email (migration 015). Null = not yet.
  handled_at: string | null;
  handled_as: string | null;
  attachments: { id: string; filename: string; url: string | null }[];
};

const SELECT =
  "id, kind, direction, delivery_failed, from_addr, to_addrs, subject, text_body, received_at, attachments_dropped, claim_email_attachments(id, filename, storage_path)";

type Raw = Omit<EmailRow, "attachments" | "handled_at" | "handled_as"> & {
  claim_email_attachments: { id: string; filename: string; storage_path: string }[] | null;
};

// The rows came through the user's client, so RLS has already proven ownership;
// the service client only mints short-lived links into the private bucket.
async function withLinks(rows: Raw[]): Promise<EmailRow[]> {
  const paths = rows.flatMap((r) => (r.claim_email_attachments ?? []).map((a) => a.storage_path));
  let urlBy = new Map<string, string | null>();
  if (paths.length) {
    const { data } = await createServiceClient().storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
    urlBy = new Map(
      (data ?? []).flatMap((s) => (s.path ? [[s.path, s.error ? null : s.signedUrl] as [string, string | null]] : [])),
    );
  }
  return rows.map(({ claim_email_attachments, ...row }) => ({
    ...row,
    handled_at: null,
    handled_as: null,
    attachments: (claim_email_attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      url: urlBy.get(a.storage_path) ?? null,
    })),
  }));
}

function failed(what: string, error: { code?: string | null; message: string }): null {
  console.error(
    `${what} read failed (${error.message})${isMissingTableError(error) ? ` — ${MIGRATION_HINT}` : ""}`,
  );
  return null;
}

/** Inbound mail not filed on a claim yet, newest first. Null when it cannot be read. */
export async function loadUnmatched(supabase: SupabaseClient): Promise<EmailRow[] | null> {
  const { data, error } = await supabase
    .from("claim_emails")
    .select(SELECT)
    .is("claim_id", null)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) return failed("inbox", error);
  return withLinks((data ?? []) as unknown as Raw[]);
}

/** Everything sent and received on one claim, newest first. Null when it cannot be read. */
export async function loadClaimEmails(supabase: SupabaseClient, claimId: string): Promise<EmailRow[] | null> {
  const { data, error } = await supabase
    .from("claim_emails")
    .select(SELECT)
    .eq("claim_id", claimId)
    .order("received_at", { ascending: false });
  if (error) return failed("claim emails", error);
  const rows = await withLinks((data ?? []) as unknown as Raw[]);

  // Read apart from the rows on purpose: before migration 015 is applied this
  // query fails, and the correspondence must still render. Unknown then means
  // "handled" — no email asks for a status update the database cannot record.
  const { data: handled, error: handledErr } = await supabase
    .from("claim_emails")
    .select("id, handled_at, handled_as")
    .eq("claim_id", claimId);
  if (handledErr) {
    console.error(`email handled-state read failed (${handledErr.message}) — check that migration 015_claim_email_handled.sql has been applied`);
    return rows.map((r) => ({ ...r, handled_at: r.received_at }));
  }
  const by = new Map((handled ?? []).map((h) => [h.id as string, h]));
  return rows.map((r) => ({
    ...r,
    handled_at: (by.get(r.id)?.handled_at as string | null | undefined) ?? null,
    handled_as: (by.get(r.id)?.handled_as as string | null | undefined) ?? null,
  }));
}

export type EmailFeature = {
  address: string; // the business's system address
  alias: string;
  domain: string;
  claimsMailbox: string | null;
  unmatched: number;
};

// Whether email is on for the signed-in business, and what the shell needs to show
// it. Off (null) when the provider is not configured, the business has no alias, or
// migration 013 has not been applied — never an error.
export async function loadEmailFeature(supabase: SupabaseClient, authUserId: string): Promise<EmailFeature | null> {
  const cfg = emailConfig();
  if (!cfg) return null;
  const { data: me, error } = await supabase
    .from("agents")
    .select("inbound_alias, claims_mailbox")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) return failed("email settings", error);
  const alias = (me?.inbound_alias as string | null) ?? null;
  if (!alias) return null;

  const { count, error: countErr } = await supabase
    .from("claim_emails")
    .select("id", { count: "exact", head: true })
    .is("claim_id", null)
    .eq("direction", "inbound");
  if (countErr) return failed("inbox count", countErr);

  return {
    address: `${alias}@${cfg.inboundDomain}`,
    alias,
    domain: cfg.inboundDomain,
    claimsMailbox: (me?.claims_mailbox as string | null) ?? null,
    unmatched: count ?? 0,
  };
}
