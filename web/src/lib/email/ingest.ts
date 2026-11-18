import { INBOUND_MAX_BYTES, overBudget, storageName } from "./budget";
import { addressOf, classifyKind, isOwnMail, parseAlias } from "./classify";
import { matchClaim } from "./match";
import type { EmailKind, InboundEmail, MatchMethod } from "./types";

export type EmailRow = {
  id: string;
  agent_id: string;
  claim_id: string | null;
  direction: "inbound";
  kind: EmailKind;
  provider_id: string;
  message_id: string | null;
  in_reply_to: string | null;
  from_addr: string;
  to_addrs: string[];
  cc_addrs: string[];
  subject: string;
  text_body: string | null;
  match_method: MatchMethod | null;
  attachments_dropped: boolean;
};

export type AttachmentRow = {
  email_id: string;
  filename: string;
  mime: string | null;
  size_bytes: number;
  storage_path: string;
};

// What ingest needs from the database and storage. The Supabase implementation is
// in store.ts; tests pass an in-memory one.
export type EmailStore = {
  hasProviderId(providerId: string): Promise<boolean>;
  agentByAlias(alias: string): Promise<{ id: string; claims_mailbox: string | null } | null>;
  claimIds(agentId: string): Promise<string[]>;
  // Message-ID of each stored message already on a claim → that claim.
  threadIndex(agentId: string): Promise<Map<string, string>>;
  upload(path: string, bytes: Uint8Array, mime: string | null): Promise<void>;
  insertEmail(row: EmailRow): Promise<void>;
  insertAttachments(rows: AttachmentRow[]): Promise<void>;
};

export type IngestResult =
  | { outcome: "own_mail" | "duplicate" | "unknown_alias" }
  | {
      outcome: "stored";
      emailId: string;
      agentId: string;
      claimId: string | null;
      kind: EmailKind;
      // What the copy to the business needs: who it goes to, the address it is sent
      // from, and the files as they were stored (empty when they were dropped).
      alias: string;
      claimsMailbox: string | null;
      files: { filename: string; content: Uint8Array }[];
    };

// Stores one inbound message and files it on a claim when it can. Anything it
// throws is a failure the caller answers with a non-200, so the provider retries:
// a message is either stored or will be tried again, never silently dropped.
export async function ingestInbound(
  email: InboundEmail,
  store: EmailStore,
  opts: { inboundDomain: string; insurerDomains: string[]; newId?: () => string },
): Promise<IngestResult> {
  // Our own copy coming back (see isOwnMail). Not stored, not copied again.
  if (isOwnMail(email, opts.inboundDomain)) return { outcome: "own_mail" };
  if (await store.hasProviderId(email.providerId)) return { outcome: "duplicate" };

  const alias = parseAlias([...email.to, ...email.cc], opts.inboundDomain);
  const agent = alias ? await store.agentByAlias(alias) : null;
  if (!agent) return { outcome: "unknown_alias" };

  const [claimIds, claimByMessageId] = await Promise.all([
    store.claimIds(agent.id),
    store.threadIndex(agent.id),
  ]);
  const match = matchClaim(email, { claimIds, claimByMessageId });
  const kind = classifyKind(email.from, agent.claims_mailbox, opts.insurerDomains);

  const emailId = (opts.newId ?? (() => crypto.randomUUID()))();
  const dropped = overBudget(email.attachments.map((a) => a.size), INBOUND_MAX_BYTES);

  // Files first, row second: the row is what the duplicate check sees, so it must
  // not exist until the files do. A failure here leaves at most orphan files, and
  // the retry stores the message whole.
  const attachments: AttachmentRow[] = [];
  const files: { filename: string; content: Uint8Array }[] = [];
  if (!dropped) {
    for (const [i, a] of email.attachments.entries()) {
      const path = `emails/${agent.id}/${emailId}/${storageName(i, a.filename)}`;
      const content = await a.download();
      await store.upload(path, content, a.mime);
      files.push({ filename: a.filename || "file", content });
      attachments.push({
        email_id: emailId, filename: a.filename || "file", mime: a.mime, size_bytes: a.size, storage_path: path,
      });
    }
  }

  await store.insertEmail({
    id: emailId,
    agent_id: agent.id,
    claim_id: match?.claimId ?? null,
    direction: "inbound",
    kind,
    provider_id: email.providerId,
    message_id: email.messageId,
    in_reply_to: email.inReplyTo,
    from_addr: addressOf(email.from) || email.from,
    to_addrs: email.to,
    cc_addrs: email.cc,
    subject: email.subject,
    text_body: email.text,
    match_method: match?.method ?? null,
    attachments_dropped: dropped && email.attachments.length > 0,
  });
  if (attachments.length) await store.insertAttachments(attachments);

  return {
    outcome: "stored", emailId, agentId: agent.id, claimId: match?.claimId ?? null, kind,
    alias: alias!, claimsMailbox: agent.claims_mailbox, files,
  };
}
