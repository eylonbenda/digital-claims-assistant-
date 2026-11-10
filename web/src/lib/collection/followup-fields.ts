export type FollowupDocType =
  | "car_photo"
  | "drivers_license"
  | "vehicle_reg"
  | "third_party_doc"
  | "no_claim_confirmation"
  | "insurance_history";

export type FollowupField = {
  type: FollowupDocType;
  label: string;
  hint?: string;
  multiple?: boolean;
};

const BASE: FollowupField[] = [
  { type: "car_photo", label: "תמונות הרכב והנזק", hint: "כמה זוויות של הנזק", multiple: true },
  { type: "drivers_license", label: "רישיון נהיגה" },
  { type: "vehicle_reg", label: "רישיון רכב" },
  { type: "third_party_doc", label: "מסמכי הצד השני", hint: "אם רלוונטי", multiple: true },
];

const FROM_INSURER = "אפשר לקבל מחברת הביטוח או מסוכן הביטוח שלך";
const NO_CLAIM: FollowupField = { type: "no_claim_confirmation", label: "אישור אי-הגשת תביעה", hint: FROM_INSURER };
const HISTORY: FollowupField = { type: "insurance_history", label: "עבר ביטוחי", hint: FROM_INSURER };

// The upload fields on the client's follow-up link. The chase message asks for
// the track's documents, so the link has to be able to accept them.
export function followupFields(claimType: string | null, policyActivated: boolean): FollowupField[] {
  if (claimType === "third_party_report") {
    return [...BASE, ...(policyActivated ? [] : [NO_CLAIM]), HISTORY];
  }
  if (claimType === "third_party_settlement") return [...BASE, NO_CLAIM];
  return BASE;
}

export const FOLLOWUP_TYPE_LABEL: Record<FollowupDocType, string> = {
  car_photo: "תמונות הרכב והנזק",
  drivers_license: "רישיון נהיגה",
  vehicle_reg: "רישיון רכב",
  third_party_doc: "מסמכי הצד השני",
  no_claim_confirmation: "אישור אי-הגשת תביעה",
  insurance_history: "עבר ביטוחי",
};
