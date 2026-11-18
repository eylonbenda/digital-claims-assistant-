import type { EmailKind } from "./types";

export const FORWARD_HEADER = "X-OpenTik-Forwarded";

/** `"Name <A@B.co>"` or a bare address → `"a@b.co"`. Empty string when there is none. */
export function addressOf(header: string): string {
  const angled = header.match(/<([^<>\s]+@[^<>\s]+)>/);
  const raw = angled ? angled[1] : header.trim();
  return /^[^\s@]+@[^\s@]+$/.test(raw) ? raw.toLowerCase() : "";
}

const domainOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1);

/** Local part of the first recipient on our inbound domain, lower-cased. */
export function parseAlias(recipients: string[], inboundDomain: string): string | null {
  const domain = inboundDomain.toLowerCase();
  for (const r of recipients) {
    const address = addressOf(r);
    if (address && domainOf(address) === domain) return address.slice(0, address.lastIndexOf("@"));
  }
  return null;
}

export function classifyKind(
  from: string,
  claimsMailbox: string | null,
  insurerDomains: string[],
): EmailKind {
  const sender = addressOf(from);
  if (!sender) return "other";
  if (claimsMailbox && sender === claimsMailbox.trim().toLowerCase()) return "business";
  const domain = domainOf(sender);
  // A subdomain of a listed domain counts (claims.fnx.co.il under fnx.co.il).
  const listed = insurerDomains.some((d) => {
    const listedDomain = d.trim().toLowerCase();
    return listedDomain !== "" && (domain === listedDomain || domain.endsWith(`.${listedDomain}`));
  });
  return listed ? "insurer" : "other";
}

// Loop guard. We copy inbound mail to the business mailbox; if that mailbox
// redirects insurer-looking mail back to us, our own copy would return, be stored
// and be copied again, forever. Mail we sent is recognisable two ways: its sender
// is on our inbound domain, or it carries the header we stamp on every copy.
export function isOwnMail(
  email: { from: string; headers: Record<string, string> },
  inboundDomain: string,
): boolean {
  const sender = addressOf(email.from);
  if (sender && domainOf(sender) === inboundDomain.toLowerCase()) return true;
  const marker = FORWARD_HEADER.toLowerCase();
  return Object.keys(email.headers).some((name) => name.toLowerCase() === marker);
}
