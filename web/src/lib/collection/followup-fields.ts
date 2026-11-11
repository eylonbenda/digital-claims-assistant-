import {
  ALL_TRACK_ITEMS,
  CLIENT_UPLOAD_DOC_TYPES,
  clientRequestedItems,
  computeChecklist,
  type ClaimFlags,
} from "@/lib/claims/checklist";

export type FollowupField = {
  type: string;
  label: string;
  hint?: string;
  multiple?: boolean;
};

const FROM_INSURER = "אפשר לקבל מחברת הביטוח או מסוכן הביטוח שלך";
const FROM_APPRAISER = "מהשמאי שבדק את הרכב";
const FROM_GARAGE = "מהמוסך שתיקן את הרכב";

// Client-facing wording per doc type. The checklist labels are written for the
// agent ("תמונות נזק"); where that reads fine to a client the checklist label is
// used as-is, so a new checklist doc shows up on the link without touching this.
const CLIENT_COPY: Record<string, Partial<FollowupField>> = {
  car_photo: { label: "תמונות הרכב והנזק", hint: "כמה זוויות של הנזק", multiple: true },
  drivers_license: { hint: "צד קדמי וצד אחורי", multiple: true },
  third_party_doc: { label: "מסמכי הצד השני", hint: "אם רלוונטי", multiple: true },
  no_claim_confirmation: { hint: FROM_INSURER },
  insurance_history: { hint: FROM_INSURER },
  loss_confirmation: { hint: FROM_INSURER },
  appraiser_report: { label: "דוח שמאי", hint: FROM_APPRAISER },
  assessor_fee_invoice: { hint: FROM_APPRAISER },
  assessor_fee_receipt: { hint: FROM_APPRAISER },
  garage_invoice: { label: "חשבונית תיקון", hint: FROM_GARAGE },
  repair_receipt: { label: "קבלה על תשלום התיקון", hint: "בנוסף לחשבונית — " + FROM_GARAGE },
  bank_details: { hint: "צילום צ'ק מבוטל או אישור ניהול חשבון" },
  keys: { label: "צילום מפתחות הרכב" },
};

// Label for any client-uploadable type: the client copy, else the first checklist
// label that names it. Also used for the "already on file" summary.
export function followupLabel(type: string): string {
  return (
    CLIENT_COPY[type]?.label ??
    ALL_TRACK_ITEMS.find((i) => i.docType === type)?.label ??
    type
  );
}

function field(type: string): FollowupField {
  const copy = CLIENT_COPY[type] ?? {};
  return { type, label: followupLabel(type), ...(copy.hint ? { hint: copy.hint } : {}), ...(copy.multiple ? { multiple: true } : {}) };
}

// The upload fields on the client's follow-up link: exactly the documents a chase
// message can currently ask for (clientRequestedItems — the same derivation the
// outbound messages use), so whatever the client is asked for, the link accepts.
// Docs already on file are left out to keep the screen short; car photos and the
// free-form third-party bucket always stay, as extras are routinely welcome.
export function followupFields(
  claimType: string | null,
  flags: ClaimFlags,
  satisfiedDocTypes: Set<string> = new Set(),
): FollowupField[] {
  const checklist = computeChecklist(claimType ?? "unknown", satisfiedDocTypes, false, {}, flags);
  const requested = clientRequestedItems(checklist)
    .map((i) => i.docType)
    .filter((t): t is string => !!t && CLIENT_UPLOAD_DOC_TYPES.has(t));

  const types = ["car_photo", ...requested.filter((t) => t !== "car_photo"), "third_party_doc"];
  return [...new Set(types)].map(field);
}
