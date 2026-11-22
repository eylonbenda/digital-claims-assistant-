// Hebrew labels for the document types an agent can file. Shared by the upload
// UI, the re-file selector and the AI classifier (server), so it lives outside
// any "use client" module.
export const DOC_OPTIONS: { type: string; label: string }[] = [
  { type: "appraiser_report",      label: "דוח שמאי" },
  { type: "garage_invoice",        label: "חשבונית תיקון" },
  { type: "repair_receipt",        label: "קבלה על תשלום" },
  { type: "payment_notice",        label: "הודעת תשלום (מהמבטחת)" },
  { type: "rejection_letter",      label: "מכתב דחייה" },
  { type: "assessor_fee_invoice",  label: 'חשבון שכ"ט שמאי' },
  { type: "assessor_fee_receipt",  label: 'קבלה שכ"ט שמאי' },
  { type: "no_claim_confirmation", label: "אישור אי-הגשת תביעה" },
  { type: "loss_confirmation",     label: "אישור הפסדים" },
  { type: "bank_details",          label: "פרטי חשבון בנק" },
  { type: "demand_form",           label: "מכתב דרישה" },
  { type: "police_report",         label: "אישור משטרה" },
  { type: "insurance_history",     label: "עבר ביטוחי" },
  { type: "lien_release",          label: "אישור הסרת שיעבוד" },
  { type: "info_consent",          label: "הסכמה למשרד הרישוי" },
  { type: "power_of_attorney",     label: "ייפוי כוח" },
  { type: "vat_offset_confirmation", label: 'אישור רו"ח — קיזוז מע"מ' },
  { type: "keys",                  label: "מפתחות" },
  { type: "id_card",               label: "תעודת זהות" },
  { type: "car_photo",             label: "תמונות נוספות" },
  { type: "third_party_doc",       label: "מסמכי צד ג'" },
  { type: "other",                 label: "אחר" },
];

// What the classifier may answer: everything above plus the two licence types an
// agent can also file (they are collected by the wizard, so the manual upload
// list leaves them out).
export const CLASSIFY_LABELS: { type: string; label: string }[] = [
  ...DOC_OPTIONS.filter((o) => o.type !== "other"),
  { type: "drivers_license", label: "רישיון נהיגה" },
  { type: "vehicle_reg",     label: "רישיון רכב" },
  { type: "other",           label: "אחר" },
];

export const docLabel = (type: string): string =>
  CLASSIFY_LABELS.find((o) => o.type === type)?.label ?? type;
