// Every value typed on camera comes from here. All of it is fictional.

// Same algorithm as web/src/lib/validation/il.ts (not imported: separate package).
export function isValidIsraeliId(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = Number(padded[i]) * (i % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

export type DemoClaim = typeof demoClaim;

// Scenario (spec §4): own policy, the insured drove, a third party is present with
// known details, nobody was hurt.
export const demoClaim = {
  client: { name: "יעל כהן", phone: "0500000001" },
  insured: { first_name: "יעל", last_name: "כהן", id_number: "000000018", mobile: "0500000001", city: "חיפה" },
  policyInsurerLabel: "הראל",
  policyInsurerKey: "harel",
  policyNumber: "40123567",
  insuranceTypeLabel: "מקיף",
  vehicle: { plate: "12345678", manufacturer: "אקספנג", model: "G6", year: "2024", color: "לבן" },
  thirdParty: { name: "אבי לוי", phone: "0500000002", plate: "87654321", insurerLabel: "מגדל" },
  accident: {
    date: "2026-11-15",
    time: "08:40",
    city: "חיפה",
    street: "שדרות ההדגמה 10",
    // Kept short on purpose: a longer text makes the wizard's summary page wider than a
    // 390px phone (app bug, fixed separately), which pans the recording.
    description: "רכב פגע בי מאחור ברמזור אדום.",
  },
} as const;
