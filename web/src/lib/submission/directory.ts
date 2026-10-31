// Insurer claims-intake directory for the prepare-and-confirm submission screen.
// Every address here must be VERIFIED by the user before it goes live — an
// unverified address mis-sends a PII-heavy claim file, so the file ships with
// claimsEmail: null everywhere and the UI falls back to manual entry.
//
// Known-but-unverified leads (from the ClaimAI competitor walkthrough, 2026-10-17 —
// docs/competitor-claimai.md): הפניקס third-party intake appeared there as
// ea5070@fnx.co.il with CC tviotrechev@fnx.co.il. Verify with הפניקס before use.
export type DirectoryEntry = {
  label: string;
  claimsEmail: string | null;
  cc: string[];
  verified: boolean;
};

const entry = (label: string): DirectoryEntry => ({
  label,
  claimsEmail: null,
  cc: [],
  verified: false,
});

// Keys match the wizard's canonical insurer keys (web/src/lib/collection/claim-state.ts).
export const INSURER_DIRECTORY: Record<string, DirectoryEntry> = {
  migdal: entry("מגדל"),
  menora: entry("מנורה"),
  hachshara: entry("הכשרה"),
  harel: entry("הראל"),
  clal: entry("כלל"),
  phoenix: entry("הפניקס"),
  ayalon: entry("איילון"),
  shlomo: entry("שלמה"),
  libra: entry("ליברה"),
  aig: entry("AIG"),
  shomera: entry("שומרה"),
  haklai: entry("חקלאי"),
  kash: entry("קש"),
};
