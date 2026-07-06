export type ItemKind = "doc" | "form" | "milestone";
export type ItemSection = "base" | "late" | "conditional" | "milestone";

export type ChecklistItemDef = {
  key: string;
  label: string;
  kind: ItemKind;
  docType?: string;
  mandatory: boolean;
  blocking: boolean;
  section: ItemSection;
  note?: string;
};

export type ClaimFlags = {
  theft: boolean;
  lien: boolean;
  business_use: boolean;
  policy_activated: boolean;
  garage_network_rider: boolean;
};

export type ComputedItem = ChecklistItemDef & { done: boolean };

export const SECTION_LABELS: Record<ItemSection, string> = {
  base: "מסמכי בסיס",
  late: "מסמכים לאחר תיקון / הגשה",
  conditional: "מסמכים מותנים",
  milestone: "אבני דרך",
};

// ─── circumstance flags ───────────────────────────────────────────────────────
// Real claim attributes the agent sets; they gate the conditional checklist below.
export type ClaimFlag = keyof ClaimFlags;

export const FLAG_DEFS: {
  key: ClaimFlag;
  label: string;
  tracks: string[]; // which claim_types this circumstance is relevant to
  warn?: string; // shown when enabled (a caution, not a doc requirement)
}[] = [
  { key: "theft", label: "גניבה / ונדליזם", tracks: ["own_policy"] },
  { key: "lien", label: "רכב משועבד", tracks: ["own_policy"] },
  { key: "business_use", label: "לקוח עסקי (עוסק / חברה)", tracks: ["own_policy"] },
  {
    key: "policy_activated",
    label: "הופעלה פוליסת הלקוח",
    tracks: ["third_party_report"],
  },
  {
    key: "garage_network_rider",
    label: "נבחרת מוסכים בפוליסה",
    tracks: ["own_policy", "third_party_report", "third_party_settlement"],
    warn: "תיקון מחוץ לרשת עלול לבטל תגמולים — ודא מוסך רשת / הסדר.",
  },
];

// Conditional items that only apply when their circumstance flag is set. Keys not
// listed here are unconditional. (policy_activated is handled specially below —
// it swaps one doc for another rather than adding/removing one.)
const FLAG_GATED: Partial<Record<string, ClaimFlag>> = {
  police_report: "theft",
  keys: "theft",
  lien_release: "lien",
  vat_offset_confirmation: "business_use",
};

// ─── per-track item configs ──────────────────────────────────────────────────

const OWN_POLICY: ChecklistItemDef[] = [
  { key: "accident_form",        label: "טופס הודעה על תאונה",              kind: "form",      mandatory: true,  blocking: true,  section: "base" },
  { key: "drivers_license",      label: "רישיון נהיגה",                    kind: "doc",  docType: "drivers_license",      mandatory: true,  blocking: true,  section: "base" },
  { key: "vehicle_reg",          label: "רישיון רכב",                      kind: "doc",  docType: "vehicle_reg",          mandatory: true,  blocking: true,  section: "base" },
  { key: "car_photo",            label: "תמונות נזק",                      kind: "doc",  docType: "car_photo",            mandatory: true,  blocking: false, section: "base" },
  { key: "appraiser_report",     label: "דוח שמאי",                        kind: "doc",  docType: "appraiser_report",     mandatory: true,  blocking: false, section: "late" },
  { key: "garage_invoice",       label: "חשבונית תיקון",                   kind: "doc",  docType: "garage_invoice",       mandatory: true,  blocking: false, section: "late" },
  { key: "bank_details",         label: "פרטי חשבון בנק",                  kind: "doc",  docType: "bank_details",         mandatory: true,  blocking: false, section: "late" },
  { key: "police_report",        label: "אישור משטרה",                     kind: "doc",  docType: "police_report",        mandatory: false, blocking: true,  section: "conditional", note: "גניבה / ונדליזם" },
  { key: "keys",                 label: "מפתחות הרכב",                     kind: "doc",  docType: "keys",                 mandatory: false, blocking: true,  section: "conditional", note: "גניבה בלבד" },
  { key: "lien_release",         label: "אישור הסרת שיעבוד",               kind: "doc",  docType: "lien_release",         mandatory: false, blocking: true,  section: "conditional", note: "רכב משועבד" },
  { key: "vat_offset_confirmation", label: 'אישור רו"ח — קיזוז מע"מ',    kind: "doc",  docType: "vat_offset_confirmation", mandatory: false, blocking: false, section: "conditional", note: "לקוח עסקי" },
  { key: "car_at_garage",        label: "רכב נכנס למוסך",                  kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
  { key: "submitted_to_insurer", label: "הוגש למבטח",                      kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
  { key: "payment_received",     label: "התקבל תשלום",                      kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
];

const THIRD_PARTY_REPORT: ChecklistItemDef[] = [
  { key: "accident_form",            label: "טופס הודעה על תאונה",                       kind: "form",      mandatory: true,  blocking: true,  section: "base" },
  { key: "vehicle_reg",              label: "רישיון רכב",                               kind: "doc",  docType: "vehicle_reg",              mandatory: true,  blocking: true,  section: "base" },
  { key: "car_photo",                label: "תמונות נזק",                               kind: "doc",  docType: "car_photo",                mandatory: true,  blocking: true,  section: "base" },
  { key: "demand_form",              label: "מכתב דרישה",                               kind: "doc",  docType: "demand_form",              mandatory: true,  blocking: true,  section: "base" },
  { key: "appraiser_report",         label: "דוח שמאי (כולל תמונות צבעוניות)",          kind: "doc",  docType: "appraiser_report",         mandatory: true,  blocking: true,  section: "late" },
  { key: "assessor_fee_invoice",     label: 'חשבון שכ"ט שמאי',                         kind: "doc",  docType: "assessor_fee_invoice",     mandatory: true,  blocking: false, section: "late" },
  { key: "assessor_fee_receipt",     label: 'קבלה על שכ"ט שמאי',                       kind: "doc",  docType: "assessor_fee_receipt",     mandatory: true,  blocking: false, section: "late" },
  { key: "garage_invoice",           label: "חשבונית תיקון מקורית",                     kind: "doc",  docType: "garage_invoice",           mandatory: true,  blocking: true,  section: "late" },
  { key: "repair_receipt",           label: "קבלה על תשלום (≠ חשבונית)",               kind: "doc",  docType: "repair_receipt",           mandatory: true,  blocking: true,  section: "late", note: "נדרשת בנפרד מהחשבונית" },
  { key: "bank_details",             label: "פרטי חשבון בנק",                           kind: "doc",  docType: "bank_details",             mandatory: true,  blocking: false, section: "late" },
  // Mutually exclusive — filtered by policy_activated flag in computeChecklist
  { key: "no_claim_confirmation",    label: "אישור אי-הגשת תביעה",                      kind: "doc",  docType: "no_claim_confirmation",    mandatory: true,  blocking: true,  section: "late", note: "כשלא הופעלה פוליסת הלקוח" },
  { key: "loss_confirmation",        label: "אישור הפסדים",                             kind: "doc",  docType: "loss_confirmation",        mandatory: false, blocking: true,  section: "late", note: "כשהופעלה פוליסת הלקוח" },
  // Optional / conditional
  { key: "insurance_history",        label: "עבר ביטוחי",                               kind: "doc",  docType: "insurance_history",        mandatory: false, blocking: false, section: "conditional", note: "ירידת ערך / אובדן גמור" },
  { key: "info_consent",             label: "הסכמה למשרד הרישוי",                       kind: "doc",  docType: "info_consent",             mandatory: false, blocking: false, section: "conditional", note: "לבדיקת עבר הרכב" },
  { key: "power_of_attorney",        label: "ייפוי כוח (§68)",                          kind: "doc",  docType: "power_of_attorney",        mandatory: false, blocking: false, section: "conditional", note: 'כשמגיש עו"ד / מוסך / סוכן' },
  { key: "car_at_garage",            label: "רכב נכנס למוסך",                           kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
  { key: "submitted_to_tp_insurer",  label: "הוגש לצד ג'",                             kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
  { key: "payment_received",         label: "התקבל תשלום",                               kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
];

const THIRD_PARTY_SETTLEMENT: ChecklistItemDef[] = [
  { key: "accident_form",         label: "טופס הודעה על תאונה",         kind: "form",      mandatory: true,  blocking: true,  section: "base" },
  { key: "vehicle_reg",           label: "רישיון רכב",                  kind: "doc",  docType: "vehicle_reg",           mandatory: true,  blocking: true,  section: "base" },
  { key: "car_photo",             label: "תמונות נזק",                  kind: "doc",  docType: "car_photo",             mandatory: true,  blocking: true,  section: "base" },
  { key: "no_claim_confirmation", label: "אישור אי-הגשת תביעה",        kind: "doc",  docType: "no_claim_confirmation", mandatory: true,  blocking: true,  section: "base" },
  { key: "bank_details",          label: "פרטי חשבון בנק",              kind: "doc",  docType: "bank_details",          mandatory: false, blocking: false, section: "conditional", note: "ירידת ערך / פיצוי ישיר" },
  { key: "approval_requested",    label: "נשלחה בקשת אישור מסלול",    kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
  { key: "route_approved",        label: "אושר מסלול מוסך הסדר",      kind: "milestone", mandatory: true,  blocking: true,  section: "milestone" },
  { key: "car_at_garage",         label: "רכב נכנס למוסך הסדר",        kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
  { key: "payment_received",      label: "שולם / הושלם",                kind: "milestone", mandatory: true,  blocking: false, section: "milestone" },
];

const UNKNOWN: ChecklistItemDef[] = [
  { key: "accident_form",    label: "טופס הודעה על תאונה", kind: "form",      mandatory: true, blocking: false, section: "base" },
  { key: "drivers_license",  label: "רישיון נהיגה",        kind: "doc",  docType: "drivers_license", mandatory: true, blocking: false, section: "base" },
  { key: "vehicle_reg",      label: "רישיון רכב",          kind: "doc",  docType: "vehicle_reg",     mandatory: true, blocking: false, section: "base" },
  { key: "car_photo",        label: "תמונות נזק",          kind: "doc",  docType: "car_photo",       mandatory: true, blocking: false, section: "base" },
];

const TRACK_ITEMS: Record<string, ChecklistItemDef[]> = {
  own_policy: OWN_POLICY,
  third_party_report: THIRD_PARTY_REPORT,
  third_party_settlement: THIRD_PARTY_SETTLEMENT,
  unknown: UNKNOWN,
};

// ─── public API ──────────────────────────────────────────────────────────────

export function computeChecklist(
  claimType: string,
  uploadedDocTypes: Set<string>,
  hasGeneratedForm: boolean,
  checklistState: Record<string, boolean>,
  flags: ClaimFlags,
): ComputedItem[] {
  let items = [...(TRACK_ITEMS[claimType] ?? TRACK_ITEMS.unknown)];

  if (claimType === "third_party_report") {
    if (flags.policy_activated) {
      // loss_confirmation replaces no_claim_confirmation as the blocking doc
      items = items
        .filter((i) => i.key !== "no_claim_confirmation")
        .map((i) => (i.key === "loss_confirmation" ? { ...i, mandatory: true } : i));
    } else {
      items = items.filter((i) => i.key !== "loss_confirmation");
    }
  }

  // Drop circumstance-conditional items whose flag isn't set, so the checklist
  // reflects this claim's actual situation instead of every possible one.
  items = items.filter((item) => {
    const req = FLAG_GATED[item.key];
    return !req || flags[req];
  });

  return items.map((item) => ({
    ...item,
    done:
      item.kind === "form"
        ? hasGeneratedForm
        : item.kind === "doc"
          ? !!(item.docType && uploadedDocTypes.has(item.docType))
          : !!checklistState[item.key],
  }));
}

export function groupBySection(
  items: ComputedItem[],
): { section: ItemSection; label: string; items: ComputedItem[] }[] {
  const ORDER: ItemSection[] = ["base", "late", "conditional", "milestone"];
  const map = new Map<ItemSection, ComputedItem[]>();
  for (const item of items) {
    if (!map.has(item.section)) map.set(item.section, []);
    map.get(item.section)!.push(item);
  }
  return ORDER.filter((s) => map.has(s)).map((s) => ({
    section: s,
    label: SECTION_LABELS[s],
    items: map.get(s)!,
  }));
}
