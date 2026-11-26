// Shapes shared by the email module (spec: docs/superpowers/specs/2026-11-15-email-relay-phase1-design.md).

// Who a stored message is from: the business's own claims mailbox, an insurer
// (sender domain in the directory), or anyone else.
export type EmailKind = "business" | "insurer" | "other";
// How a message got onto its claim. "auto_ack" is the one guess among them: see matchAck().
export type MatchMethod = "subject_id" | "thread" | "auto_ack" | "manual";

export type InboundAttachment = {
  filename: string;
  mime: string | null;
  size: number;
  download: () => Promise<Uint8Array>;
};

// One inbound message as the provider adapter hands it over. `text` is the plain
// text part or null — HTML is never read.
export type InboundEmail = {
  providerId: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  headers: Record<string, string>;
  attachments: InboundAttachment[];
};
