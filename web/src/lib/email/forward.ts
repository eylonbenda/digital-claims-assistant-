import { addressOf } from "./classify";
import { inboundAddress } from "./config";
import type { InboundEmail } from "./types";

export type ForwardPlan = { to: string; from: string; subject: string; text: string };

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
