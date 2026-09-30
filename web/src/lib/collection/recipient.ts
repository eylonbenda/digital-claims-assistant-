// Who the claimant's details actually go to.
//
// The wizard used to say "לסוכן" throughout. The product serves two segments —
// insurance agents *and* garages (מוסכים) — and the only pilot customer is a
// garage, so "הסוכן" was simply wrong on screen for every real claim so far, and
// wrong in the consent the claimant signs.
//
// Two rules here:
//   1. Name the actual business when we know it (`agents.name`) — concrete and
//      true for either segment.
//   2. Where no name is stored, or where the sentence can't carry one, stay
//      segment-neutral. Never guess at "סוכן" or "מוסך".
//
// Kept free of gendered verb agreement: a business name has no grammatical gender
// we can rely on, so the phrasings below are either first-person plural ("נעבור
// על הפרטים") or passive ("תישלח התראה").

/** Neutral stand-in used when the business has no name stored. */
export const NEUTRAL_HANDLER = "הגוף המטפל בתביעה";

/** Post-submit heading: "הפרטים נשלחו למוסך כהן" / "הפרטים נשלחו לטיפול". */
export function sentTitle(handlerName?: string | null): string {
  const name = handlerName?.trim();
  return name ? `הפרטים נשלחו ל${name}` : "הפרטים נשלחו לטיפול";
}

/**
 * The recipient as named in the insured's declaration. This one is
 * legally load-bearing — it tells the claimant who their personal data is
 * disclosed to — so it stays explicit about the *role* rather than leaning on a
 * business name that may be absent: "מטעמי" covers an agent, a garage, or anyone
 * else acting for the insured.
 */
export const CONSENT_RECIPIENT = "לגוף המטפל בתביעה מטעמי";
