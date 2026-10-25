import { INSURER_DIRECTORY } from "./directory";

// Canonicalize a client-typed insurer name to a directory key. Exact match
// only (after trimming and quote-normalizing) — no fuzzy matching: a wrong
// auto-match would point a PII-heavy submission at the wrong insurer. An
// uncertain name stays null and the agent picks by hand.
export function matchInsurer(freeText: string | null): string | null {
  if (!freeText) return null;
  const norm = freeText.trim().replace(/["'`׳״]/g, "").toLowerCase();
  if (!norm) return null;
  for (const [key, entry] of Object.entries(INSURER_DIRECTORY)) {
    if (norm === key || norm === entry.label.toLowerCase()) return key;
  }
  return null;
}
