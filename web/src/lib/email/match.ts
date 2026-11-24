import type { InboundEmail, MatchMethod } from "./types";

/** Unique, lower-cased 8-hex tokens in a subject — candidates for a claim's short id. */
export function extractShortIds(subject: string): string[] {
  const found = subject.match(/\b[0-9a-f]{8}\b/gi) ?? [];
  return [...new Set(found.map((t) => t.toLowerCase()))];
}

export type MatchCandidates = {
  // Every claim id of the receiving business — and only that business.
  claimIds: string[];
  // Message-ID of each stored message already on a claim → that claim.
  claimByMessageId: Map<string, string>;
};

// Which claim an inbound message belongs to. Subject first: buildSubject() ends
// every subject with the first 8 hex characters of the claim id, and forwards and
// replies keep the subject. A licence plate is also 8 digits and so also valid
// hex — which is why a token only counts when it prefixes a claim id, and why two
// tokens naming two different claims are not trusted. Then the thread. No fuzzy
// matching on names or plates: a wrong match files one client's correspondence on
// another client's claim. What neither finds goes to matchAck() below.
export function matchClaim(
  email: Pick<InboundEmail, "subject" | "inReplyTo" | "references">,
  candidates: MatchCandidates,
): { claimId: string; method: "subject_id" | "thread" } | null {
  const tokens = extractShortIds(email.subject);
  if (tokens.length) {
    const hits = new Set(
      candidates.claimIds.filter((id) => tokens.some((t) => id.toLowerCase().startsWith(t))),
    );
    if (hits.size === 1) return { claimId: [...hits][0], method: "subject_id" };
  }
  for (const ref of [email.inReplyTo, ...email.references]) {
    if (!ref) continue;
    const claimId = candidates.claimByMessageId.get(ref);
    if (claimId) return { claimId, method: "thread" };
  }
  return null;
}

// How long after a send a message from its recipient is taken for the automatic reply.
export const ACK_WINDOW_MS = 5 * 60_000;

// One of the business's stored messages from the last ACK_WINDOW_MS.
export type RecentEmail = {
  direction: "outbound" | "inbound";
  claimId: string | null;
  from: string;
  to: string[];
  matchMethod: MatchMethod | null;
};

// An insurer's automatic "we got your message" reply carries nothing to match on:
// its own subject, no In-Reply-To, a canned body (weSure, 2026-11-24). All that ties
// it to a claim is that it comes from the address a claim was just sent to. That is
// a guess, so it is kept narrow: the sends to that address in the window must all be
// for one claim, and each send accounts for one reply. Two claims sent to the same
// address, or a second message after the reply, are left for the clerk — a filed
// message cannot be moved to another claim afterwards.
export function matchAck(sender: string, recent: RecentEmail[]): string | null {
  const address = sender.toLowerCase();
  if (!address) return null;
  const sends = recent.filter(
    (m) => m.direction === "outbound" && m.claimId && m.to.some((t) => t.toLowerCase() === address),
  );
  const claims = new Set(sends.map((m) => m.claimId!));
  if (claims.size !== 1) return null;
  const [claimId] = claims;
  const acks = recent.filter(
    (m) =>
      m.direction === "inbound" && m.matchMethod === "auto_ack" &&
      m.claimId === claimId && m.from.toLowerCase() === address,
  );
  return acks.length < sends.length ? claimId : null;
}
