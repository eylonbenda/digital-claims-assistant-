import type { Submission } from "@/lib/submission/compose";
import { validRecipient } from "@/lib/submission/confirm";
import { OUTBOUND_MAX_BYTES, overBudget } from "./budget";
import { addressOf } from "./classify";
import { inboundAddress } from "./config";

export type SendPlan = {
  from: string;
  replyTo: string;
  to: string;
  cc: string[];
  subject: string;
  text: string;
};

export const SEND_ERROR = {
  noSubmission: "יש לסווג את התביעה לפני שליחה למבטחת",
  notEnabled: "שליחת מייל לא הופעלה לעסק הזה",
  invalidRecipient: "כתובת הנמען אינה תקינה",
  notInsurer: "כתובת הנמען אינה כתובת של מבטחת",
  tooLarge: "הקבצים גדולים מדי לשליחה במייל אחד (מעל 20MB) — שלחו ידנית",
} as const;

// The display name sits inside a quoted string in the From header; a quote, a
// backslash or a line break in it would end the string or start a new header.
function displayName(name: string | null): string {
  const clean = (name ?? "").replace(/["\\\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? `${clean} (OpenTik)` : "OpenTik";
}

// Pure planner behind POST /api/claims/[id]/submission/send: who the message is
// from, who gets it, and what it says — or why it must not go out. The message is
// the insurer-ready text from composeSubmission(), with nothing added.
export function planSend(input: {
  business: { name: string | null; claimsMailbox: string | null; inboundAlias: string | null };
  inboundDomain: string;
  recipient: string;
  submission: Submission | null;
  sizes: number[];
}): { error: string } | SendPlan {
  const { business, submission } = input;
  if (!submission) return { error: SEND_ERROR.noSubmission };
  if (!business.inboundAlias) return { error: SEND_ERROR.notEnabled };

  const to = validRecipient(input.recipient)?.toLowerCase();
  if (!to) return { error: SEND_ERROR.invalidRecipient };

  // The clerk confirms an address before every send; these two can only be a slip —
  // our own address, or the business's, in the insurer's place.
  const domain = input.inboundDomain.toLowerCase();
  const mailbox = business.claimsMailbox ? addressOf(business.claimsMailbox) : "";
  if (to.endsWith(`@${domain}`) || (mailbox && to === mailbox)) {
    return { error: SEND_ERROR.notInsurer };
  }

  if (overBudget(input.sizes, OUTBOUND_MAX_BYTES)) return { error: SEND_ERROR.tooLarge };

  const address = inboundAddress(business.inboundAlias, domain);
  const name = displayName(business.name);
  return {
    from: name === "OpenTik" ? `OpenTik <${address}>` : `"${name}" <${address}>`,
    replyTo: address,
    to,
    cc: mailbox ? [mailbox] : [],
    subject: submission.subject,
    text: submission.body,
  };
}
