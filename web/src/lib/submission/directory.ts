// Insurer claims-intake directory for the prepare-and-confirm submission screen.
// An address here pre-fills the recipient; the clerk still sees it, can change it,
// and confirms before anything is sent. Only add an address the user supplied —
// a wrong one mis-sends a PII-heavy claim file. No address = manual entry.
//
// Addresses supplied by the user on 2026-11-19, by department:
// - policy: the insurer's own-policy claims desk (own_policy track).
// - thirdParty: its third-party claims desk (third_party_report and
//   third_party_settlement — both go to the at-fault insurer).
//
// Known-but-unverified lead (from the ClaimAI competitor walkthrough, 2026-10-17 —
// docs/competitor-claimai.md): הפניקס third-party intake appeared there as
// ea5070@fnx.co.il with CC tviotrechev@fnx.co.il. Verify with הפניקס before use.
export type DirectoryEntry = {
  label: string;
  policyEmail: string | null;
  thirdPartyEmail: string | null;
  cc: string[];
  // Mail domains the insurer writes from ("fnx.co.il"). Used only to label inbound
  // mail as coming from an insurer; a wrong or missing entry mislabels a message,
  // nothing more.
  domains: string[];
};

const entry = (
  label: string,
  addresses: { policy?: string; thirdParty?: string; domains?: string[] } = {},
): DirectoryEntry => ({
  label,
  policyEmail: addresses.policy ?? null,
  thirdPartyEmail: addresses.thirdParty ?? null,
  cc: [],
  domains: addresses.domains ?? [],
});

// Keys match the wizard's canonical insurer keys (web/src/lib/collection/claim-state.ts).
export const INSURER_DIRECTORY: Record<string, DirectoryEntry> = {
  migdal: entry("מגדל", { policy: "cart@migdal.co.il", thirdParty: "avitalmi@migdal.co.il", domains: ["migdal.co.il"] }),
  menora: entry("מנורה", { policy: "merkazd@menora.co.il", thirdParty: "merkazd@menora.co.il", domains: ["menora.co.il"] }),
  hachshara: entry("הכשרה", { policy: "hesder2@hcsra.co.il", domains: ["hcsra.co.il"] }),
  harel: entry("הראל"),
  clal: entry("כלל", { policy: "tviot-r@clal-ins.co.il", domains: ["clal-ins.co.il"] }),
  phoenix: entry("הפניקס"),
  ayalon: entry("איילון", { policy: "tviot_rechev@ayalon-ins.co.il", thirdParty: "kalgimel@ayalon-ins.co.il", domains: ["ayalon-ins.co.il"] }),
  shlomo: entry("שלמה"),
  libra: entry("ליברה", { thirdParty: "tviotg@lbr.co.il", domains: ["lbr.co.il"] }),
  aig: entry("AIG"),
  shomera: entry("שומרה", { policy: "tvihesder@shomera.co.il", domains: ["shomera.co.il"] }),
  haklai: entry("חקלאי"),
  kash: entry("קש"),
  wesure: entry("ווישור", { domains: ["we-sure.co.il"] }),
  anchor: entry("אנקור"),
};

/** The intake address for a claim track, or null when we have none (manual entry). */
export function claimsAddress(e: DirectoryEntry, track: "own_policy" | "third_party"): string | null {
  return track === "own_policy" ? e.policyEmail : e.thirdPartyEmail;
}

/** Every known insurer mail domain, for classifying inbound mail. */
export function insurerDomains(): string[] {
  return Object.values(INSURER_DIRECTORY).flatMap((e) => e.domains);
}
