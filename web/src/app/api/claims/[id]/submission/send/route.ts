import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";
import { planConfirm } from "@/lib/submission/confirm";
import { buildSubmission, loadSubmissionSource } from "@/lib/submission/build";
import { effectiveHandling } from "@/lib/handling/effective";
import { emailConfig } from "@/lib/email/config";
import { EMAIL_COPY } from "@/lib/email/copy";
import { sendEmail } from "@/lib/email/provider";
import { planSend } from "@/lib/email/send";
import { reportError, serverError } from "@/lib/observability/report";

const WHERE = "/api/claims/[id]/submission/send";
const BUCKET = "claim-docs";
const ALREADY_SENT = "התביעה כבר סומנה כנשלחה";

// Downloading the packet and handing it to the provider can take a while.
export const maxDuration = 60;

// The attachment's name in the insurer's mailbox: the Hebrew label the clerk saw,
// with the stored file's extension.
function attachmentName(label: string, storagePath: string): string {
  const ext = storagePath.match(/\.([A-Za-z0-9]{1,8})$/)?.[0].toLowerCase() ?? "";
  return `${label.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "file"}${ext}`;
}

// POST /api/claims/[id]/submission/send
// Body: { recipient: string, insurerKey?: string, confirmed: true }
// Sends the claim packet to the insurer from the business's system address, with
// the business's claims mailbox in copy, then marks the claim sent exactly as the
// manual confirm route does. The message is rebuilt here from the database — the
// client supplies only the recipient it confirmed.
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

  const cfg = emailConfig();
  if (!cfg) return Response.json({ error: "email not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.recipient !== "string" || body.confirmed !== true) {
    return Response.json({ error: "recipient (string) and confirmed: true required" }, { status: 400 });
  }
  const insurerKey = typeof body.insurerKey === "string" && body.insurerKey ? body.insurerKey : undefined;

  // RLS-scoped: a claim of another business reads as missing.
  const src = await loadSubmissionSource(supabase, id, user.id);
  if (!src) return Response.json({ error: "not found" }, { status: 404 });

  const { data: me, error: meErr } = await supabase
    .from("agents")
    .select("id, name, claims_mailbox, inbound_alias")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  // A failed read here is migration 013 not applied: the feature is off, not broken.
  if (meErr || !me) return Response.json({ error: "email not configured" }, { status: 503 });

  const { submission } = buildSubmission(src);
  const business = {
    name: (me.name as string | null) ?? null,
    claimsMailbox: (me.claims_mailbox as string | null) ?? null,
    inboundAlias: (me.inbound_alias as string | null) ?? null,
  };
  const planInput = { business, inboundDomain: cfg.inboundDomain, recipient: body.recipient, submission };

  // Everything that can refuse the send is checked before a single byte is fetched.
  const early = planSend({ ...planInput, sizes: [] });
  if ("error" in early) return Response.json({ error: early.error }, { status: 400 });

  const checklistState = src.claim.checklist_state ?? {};
  if (effectiveHandling(src.handlingStatus, checklistState, src.claim.claim_type)) {
    return Response.json({ error: ALREADY_SENT }, { status: 409 });
  }
  const now = new Date();
  const confirm = planConfirm({
    recipient: early.to,
    subject: early.subject,
    insurerKey,
    current: {
      claim_type: src.claim.claim_type,
      handling_status: src.handlingStatus,
      checklist_state: checklistState,
    },
    now,
  });
  if ("error" in confirm) return Response.json({ error: confirm.error }, { status: 400 });

  const svc = createServiceClient();
  const attachments: { filename: string; content: Uint8Array }[] = [];
  for (const a of submission!.attachments) {
    const { data, error } = await svc.storage.from(BUCKET).download(a.storagePath);
    if (error || !data) {
      await reportError(WHERE, error ?? new Error("attachment missing"), { claimId: id });
      return Response.json({ error: EMAIL_COPY.attachmentMissing }, { status: 500 });
    }
    attachments.push({
      filename: attachmentName(a.label, a.storagePath),
      content: new Uint8Array(await data.arrayBuffer()),
    });
  }

  const plan = planSend({ ...planInput, sizes: attachments.map((a) => a.content.byteLength) });
  if ("error" in plan) return Response.json({ error: plan.error }, { status: 400 });

  let providerId: string;
  try {
    ({ providerId } = await sendEmail(cfg, { ...plan, attachments }));
  } catch (err) {
    // Nothing went out and nothing is recorded: the clerk can simply try again.
    await reportError(WHERE, err, { claimId: id });
    return Response.json({ error: EMAIL_COPY.sendFailed }, { status: 502 });
  }

  // From here on the message is with the insurer. A failure below must not read as
  // "not sent" — that would invite a second send.
  const { error: markErr, count } = await svc
    .from("claims")
    .update(
      { ...confirm.update, checklist_state: { ...checklistState, [confirm.milestone]: true } },
      { count: "exact" },
    )
    .eq("id", id)
    .is("handling_status", null);

  const { error: rowErr } = await svc.from("claim_emails").insert({
    agent_id: me.id,
    claim_id: id,
    direction: "outbound",
    kind: "business",
    provider_id: providerId,
    from_addr: plan.replyTo,
    to_addrs: [plan.to],
    cc_addrs: plan.cc,
    subject: plan.subject,
    text_body: plan.text,
    received_at: now.toISOString(),
  });
  if (rowErr) await reportError(WHERE, rowErr, { claimId: id, step: "record" });

  if (markErr) {
    await reportError(WHERE, markErr, { claimId: id, step: "mark_sent" });
    return Response.json({ error: EMAIL_COPY.sentNotRecorded, sent: true }, { status: 500 });
  }
  // count 0: a concurrent confirm marked it first — the claim is sent either way.
  if (count) {
    await svc.from("claim_events").insert({
      claim_id: id,
      type: confirm.event.type,
      payload_json: { ...confirm.event.payload, direct: true },
    });
    try {
      await runEngine(id, { type: "milestone_ticked", key: confirm.milestone, done: true });
    } catch (err) {
      return serverError(WHERE, err, { claimId: id, step: "engine" });
    }
  }

  return Response.json({ ok: true, sentAt: now.toISOString() });
}
