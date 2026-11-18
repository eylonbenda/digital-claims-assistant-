import { createServiceClient } from "@/lib/supabase/service";
import { OUTBOUND_MAX_BYTES, overBudget } from "@/lib/email/budget";
import { FORWARD_HEADER } from "@/lib/email/classify";
import { emailConfig, type EmailConfig } from "@/lib/email/config";
import { recordDeliveryFailure } from "@/lib/email/failure";
import { FILES_IN_APP_NOTE, alreadyHasIt, planForward } from "@/lib/email/forward";
import { ingestInbound, type IngestResult } from "@/lib/email/ingest";
import { readDeliveryFailure, readInbound, sendEmail, verifyWebhook } from "@/lib/email/provider";
import { supabaseEmailStore, supabaseFailureStore } from "@/lib/email/store";
import type { InboundEmail } from "@/lib/email/types";
import { insurerDomains } from "@/lib/submission/directory";
import { reportError, serverError } from "@/lib/observability/report";

const WHERE = "/api/inbound/email";

// Sends the business a copy of a message that was just stored, so the mailbox the
// clerk works from stays complete. Marked with FORWARD_HEADER so it is never
// ingested and copied again.
async function forwardCopy(
  cfg: EmailConfig,
  email: InboundEmail,
  stored: Extract<IngestResult, { outcome: "stored" }>,
): Promise<void> {
  if (alreadyHasIt(email, stored.claimsMailbox)) return;
  const plan = planForward(email, stored.claimsMailbox, cfg.inboundDomain, stored.alias);
  if (!plan) return;
  const tooLarge = overBudget(stored.files.map((f) => f.content.byteLength), OUTBOUND_MAX_BYTES);
  await sendEmail(cfg, {
    ...plan,
    text: tooLarge ? `${plan.text}\n\n${FILES_IN_APP_NOTE}` : plan.text,
    headers: { [FORWARD_HEADER]: "1" },
    attachments: tooLarge ? [] : stored.files,
  });
}

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

  // A send that bounced or failed: flag it and give the clerk a task.
  const failure = readDeliveryFailure(event);
  if (failure) {
    try {
      const outcome = await recordDeliveryFailure(failure.providerId, supabaseFailureStore(createServiceClient()));
      return Response.json({ ok: true, outcome });
    } catch (err) {
      return serverError(WHERE, err, { emailId: failure.providerId });
    }
  }

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
    if (result.outcome === "stored") {
      // The message is stored. A copy that fails must not fail the request: the
      // provider would redeliver, and the retry would only be dropped as a duplicate.
      try {
        await forwardCopy(cfg, email, result);
      } catch (err) {
        await reportError(WHERE, err, { emailId: event.data.email_id, step: "forward" });
      }
    }
    return Response.json({ ok: true, outcome: result.outcome });
  } catch (err) {
    // Includes a missing claim_emails table: if this keeps failing, check that
    // migration 013_claim_emails.sql has been applied to this database.
    return serverError(WHERE, err, { emailId: event.data.email_id });
  }
}
