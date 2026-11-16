import type { InboundEmail } from "./types";

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
// another client's claim.
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
