import { addressOf } from "./classify";
import { inboundAddress } from "./config";
import type { InboundEmail } from "./types";

export type ForwardPlan = { to: string; from: string; subject: string; text: string };

// The copy is skipped when the business already has the message: it wrote it, or
// the sender addressed its mailbox directly (an insurer's "reply all").
export function alreadyHasIt(
  email: Pick<InboundEmail, "from" | "to" | "cc">,
  claimsMailbox: string | null,
): boolean {
  const mailbox = claimsMailbox ? addressOf(claimsMailbox) : "";
  if (!mailbox) return false;
  return [email.from, ...email.to, ...email.cc].some((a) => addressOf(a) === mailbox);
}

export const FILES_IN_APP_NOTE = "הקבצים המצורפים גדולים מדי להעברה במייל — הם זמינים במערכת.";

export const FORWARD_SUBJECT_PREFIX = "[OpenTik] ";

// The copy of an inbound message that goes to the business's own claims mailbox,
// so the mailbox the clerk works from stays complete. Sent with FORWARD_HEADER
// (classify.ts) so it can never be ingested and copied again.
export function planForward(
  email: Pick<InboundEmail, "from" | "subject" | "text">,
  claimsMailbox: string | null,
  inboundDomain: string,
  alias: string,
): ForwardPlan | null {
  const to = claimsMailbox ? addressOf(claimsMailbox) : "";
  if (!to) return null;
  const sender = addressOf(email.from) || email.from.trim() || "שולח לא ידוע";
  const body = email.text?.trim() ?? "";
  return {
    to,
    from: `OpenTik <${inboundAddress(alias, inboundDomain.toLowerCase())}>`,
    subject: `${FORWARD_SUBJECT_PREFIX}${email.subject}`,
    text: `התקבל מייל מאת ${sender}.${body ? `\n\n${body}` : ""}`,
  };
}
