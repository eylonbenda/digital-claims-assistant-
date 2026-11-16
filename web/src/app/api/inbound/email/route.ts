import { createServiceClient } from "@/lib/supabase/service";
import { emailConfig } from "@/lib/email/config";
import { ingestInbound } from "@/lib/email/ingest";
import { readInbound, verifyWebhook } from "@/lib/email/provider";
import { supabaseEmailStore } from "@/lib/email/store";
import { insurerDomains } from "@/lib/submission/directory";
import { serverError } from "@/lib/observability/report";

export const runtime = "nodejs";
// Fetching the message and its attachments, then storing them, within one request.
export const maxDuration = 60;

// POST /api/inbound/email — the mail provider's webhook. Not session-authenticated:
// the provider's signature is the only credential, and it is checked on the raw body
// before anything is read from it.
//
// Status codes are the contract with the provider's retry logic: 200 means "done,
// do not send again" (stored, a duplicate, our own mail, an address nobody owns, an
// event we do not handle); anything else means "send it again".
export async function POST(request: Request) {
  const cfg = emailConfig();
  if (!cfg) return Response.json({ error: "email is not configured" }, { status: 503 });

  const rawBody = await request.text();
  const event = verifyWebhook(cfg, rawBody, request.headers);
  if (!event) return Response.json({ error: "invalid signature" }, { status: 401 });

  if (event.type !== "email.received") return Response.json({ ok: true, ignored: event.type });

  try {
    const email = await readInbound(cfg, event);
    if (!email) return Response.json({ ok: true, ignored: event.type });

    const result = await ingestInbound(email, supabaseEmailStore(createServiceClient()), {
      inboundDomain: cfg.inboundDomain,
      insurerDomains: insurerDomains(),
    });
    if (result.outcome === "unknown_alias") {
      // Retrying cannot fix an address nobody owns; say so in the logs and move on.
      console.warn("inbound email: no business for the recipient address — message not stored");
    }
    return Response.json({ ok: true, outcome: result.outcome });
  } catch (err) {
    // Includes a missing claim_emails table: if this keeps failing, check that
    // migration 013_claim_emails.sql has been applied to this database.
    return serverError("/api/inbound/email", err, { emailId: event.data.email_id });
  }
}
