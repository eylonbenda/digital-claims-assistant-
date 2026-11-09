import type { ClaimData, Fault, InsuranceType } from "@/lib/formfill/types";
import { toILDate } from "@/lib/dates";

// The wizard's working shape. Persisted verbatim to `claims.summary_json.collected`
// at submit, so the agent side can re-derive the canonical ClaimData server-side.
export type DocType = "car_photo" | "drivers_license" | "vehicle_reg";
// The two documents the base checklist marks mandatory+blocking. The wizard
// requires them, but never hard-blocks on them — see `docsDeferred`.
export const REQUIRED_DOC_TYPES = ["drivers_license", "vehicle_reg"] as const;
export type RequiredDocType = (typeof REQUIRED_DOC_TYPES)[number];

export type RequiredDocSpec = {
  type: RequiredDocType;
  /** Completed uploads needed. Two for the licence: front and back. */
  min: number;
  /** Skipped entirely when false — an irrelevant document must never block. */
  appliesTo: (s: State) => boolean;
};

// Pilot feedback (2026-09-29): **both sides** of the driving licence, and the
// licence of whoever was driving at the time of the accident — not automatically
// the policyholder. Kept on the existing `drivers_license` doc type (two files)
// rather than splitting into front/back types, which are a Postgres enum and would
// need a hand-applied migration plus changes across checklist, form-fill and chase.
//
// The licence is asked for even when the car was hit while parked (product call,
// 2026-09-29). It was briefly exempted there on the grounds that nobody drove, but
// the insurer wants the policyholder's licence on the accident notice either way,
// and the escape hatch already means asking can't hard-block anyone: a claimant with
// no licence to hand ticks "אשלח בהמשך" and moves on. Only the wording changes —
// the parked case asks for the owner's licence, not the driver's.
//
// `appliesTo` is kept as the hook for a requirement that genuinely doesn't apply to
// some claims; nothing uses it to exclude a document today.
export const REQUIRED_DOCS: RequiredDocSpec[] = [
  { type: "drivers_license", min: 2, appliesTo: () => true },
  { type: "vehicle_reg", min: 1, appliesTo: () => true },
];

// The name of whoever drove, for the licence upload prompt — "" when the wizard
// doesn't know it. Pilot (2026-09-29): clients send the policyholder's licence when
// someone else drove, so the prompt names the person whose licence we want. A parked
// car yields "": the owner isn't necessarily the policyholder, and we never ask.
export function licenceHolderName(s: State): string {
  if (s.driver?.parked || s.driver?.isInsured == null) return "";
  const who = s.driver.isInsured ? s.insured : s.driver;
  return [who.first_name, who.last_name].map((p) => p.trim()).filter(Boolean).join(" ");
}
export type UploadedDoc = {
  localId: string;
  type: DocType;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

// One third-party vehicle as the claimant reports it.
export type TpEntry = { details_unknown?: boolean; name: string; phone: string; plate: string; insurer: string };
export const EMPTY_TP: TpEntry = { name: "", phone: "", plate: "", insurer: "" };
export const MAX_THIRD_PARTIES = 3;

// Third-party insurer sentinels the wizard stores as the insurer value. Both are plain
// Hebrew so they print as-is on the form, but neither names a company: "לא ידוע" is
// "not known yet" (still to chase), "לא מבוטח" is a known answer — there is no insurer
// (expert review 2026-11-01). Use isNamedTpInsurer() wherever "do we have the insurer" matters.
export const TP_INSURER_UNKNOWN = "לא ידוע";
export const TP_INSURER_NONE = "לא מבוטח";
export const isNamedTpInsurer = (v: string | null | undefined): v is string =>
  !!v && v.trim() !== "" && v !== TP_INSURER_UNKNOWN && v !== TP_INSURER_NONE;

// מוקד נזק — where the claimant's car was hit. Expert review (2026-11-01): insurers check
// it, so it's asked as a structured question. Several adjacent areas together are one
// focus (front + right = the front-right corner); a second focus is asked separately,
// because two foci (e.g. front + rear in a chain collision) may be two separate accidents.
export const DAMAGE_AREAS = ["front", "rear", "right", "left"] as const;
export type DamageArea = (typeof DAMAGE_AREAS)[number];
export const DAMAGE_AREA_LABEL: Record<DamageArea, string> = {
  front: "קדמי",
  rear: "אחורי",
  right: "צד ימין",
  left: "צד שמאל",
};

export type State = {
  consent: boolean;
  injuries: boolean | null;
  policyInsurer: string; // the claimant's own insurer (drives which accident-notice form gets filled); "unknown" = client isn't sure, agent completes
  insuranceType: InsuranceType | "" | "unknown"; // מקיף / חובה / צד ג' — pivots own_policy viability; "unknown" = client isn't sure
  insured: { first_name: string; last_name: string; id_number: string; mobile: string; city: string };
  driver: {
    isInsured: boolean | null;
    parked?: boolean; // nobody drove — the car was hit while parked. Optional: absent on pre-existing saves.
    first_name: string;
    last_name: string;
    id_number: string;
    license_number: string;
    relation_to_insured: string;
  };
  vehicle: { plate: string; manufacturer: string; year: string };
  accident: {
    date: string;
    time: string;
    // Free-text place as asked until 2026-11 — still read from older drafts and
    // submitted blobs (see accidentPlace). New input goes to street + city.
    location: string;
    // Expert review (2026-11-01): split, both optional — the client fills this in after
    // the event, not at the scene. Optional: absent on pre-split saves.
    city?: string;
    street?: string;
    description: string;
  };
  // מוקד נזק. Optional: absent on saves from before the question existed.
  // `unsure` stands in for the areas (R2: every mandatory answer has an escape hatch);
  // `hasMore` / `moreAreas` are the "יש מוקד נזק נוסף?" follow-up.
  damage?: { areas: DamageArea[]; unsure?: boolean; hasMore: boolean | null; moreAreas: DamageArea[] };
  fault: Fault | null;
  // details_unknown: the client can't identify the other side (e.g. hit-and-run) —
  // unblocks the wizard while keeping whatever partial details they do have.
  thirdParty: { present: boolean | null } & TpEntry;
  // Vehicles beyond the first, for multi-car accidents (pilot, 2026-10-31: two TP
  // vehicles, and the operator wrote the second onto the form by hand). Kept apart from
  // `thirdParty` so drafts and submitted `collected` blobs from older deploys load
  // unchanged. Optional: absent on those saves. At most MAX_THIRD_PARTIES - 1 entries.
  extraThirdParties?: TpEntry[];
  declaration: {
    data_consent: boolean;
    poa_third_party: boolean;
    signed_date: string; // ISO yyyy-mm-dd, captured when data_consent is first ticked
  };
  documents: UploadedDoc[];
  // Pilot feedback (2026-09-27, the operator): the licence and vehicle-registration
  // uploads must be required, because today they arrive missing and she chases them
  // by hand. They are required — but with an explicit way out, because R2 (the one
  // validated behavioural finding in docs/assumptions-canvas.md) is that every
  // mandatory field needs an escape hatch: post-accident the documents are often in
  // a towed car or with the police. A deferral is recorded rather than silently
  // absent, so the agent sees "the client said they'd send it" instead of guessing.
  // Optional: absent on drafts saved by an older deploy.
  docsDeferred?: Partial<Record<RequiredDocType, boolean>>;
};

// Every third-party vehicle the claimant reported, first one first — [] when they said
// there was none. The single place that knows the first vehicle lives apart.
export function allThirdParties(s: State): TpEntry[] {
  if (!s.thirdParty.present) return [];
  const { name, phone, plate, insurer, details_unknown } = s.thirdParty;
  const first: TpEntry = { name, phone, plate, insurer, ...(details_unknown !== undefined ? { details_unknown } : {}) };
  return [first, ...(s.extraThirdParties ?? [])].slice(0, MAX_THIRD_PARTIES);
}

// The accident place as one line, for the canonical `accident.location` (the forms have
// a single cell). A save from before the street/city split has neither field, and its
// free-text `location` stands in for the street — so older claims render unchanged.
export function accidentPlace(s: Pick<State, "accident">): string {
  const street = (s.accident.street ?? s.accident.location ?? "").trim();
  const city = (s.accident.city ?? "").trim();
  return [street, city].filter(Boolean).join(", ");
}

const areasText = (areas: readonly DamageArea[]) =>
  DAMAGE_AREAS.filter((a) => areas.includes(a)).map((a) => DAMAGE_AREA_LABEL[a]).join(" + ");

// The damage focus as form text, e.g. "מוקד נזק: קדמי + צד ימין; מוקד נזק נוסף: אחורי".
// "" when the question wasn't answered (older saves).
export function damageFocusText(s: Pick<State, "damage">): string {
  const d = s.damage;
  if (!d) return "";
  const main = d.unsure ? "לא ידוע" : areasText(d.areas ?? []);
  if (!main) return "";
  const more = !d.unsure && d.hasMore ? areasText(d.moreAreas ?? []) : "";
  return `מוקד נזק: ${main}${more ? `; מוקד נזק נוסף: ${more}` : ""}`;
}

// Israeli insurers. `templated` = we have a coordinate template, so the form auto-fills.
// Others are still selectable (persisted), but the agent fills the form manually for now.
export const INSURERS: { key: string; label: string; templated: boolean }[] = [
  { key: "migdal", label: "מגדל", templated: true },
  { key: "menora", label: "מנורה", templated: true },
  { key: "hachshara", label: "הכשרה", templated: true },
  { key: "harel", label: "הראל", templated: true },
  { key: "clal", label: "כלל", templated: true },
  { key: "phoenix", label: "הפניקס", templated: true },
  { key: "ayalon", label: "איילון", templated: true },
  { key: "shlomo", label: "שלמה", templated: true },
  { key: "libra", label: "ליברה", templated: true },
  { key: "aig", label: "AIG", templated: true },
  { key: "shomera", label: "שומרה", templated: true },
  { key: "haklai", label: "חקלאי", templated: true },
  { key: "kash", label: "קש", templated: true },
];

// Maps the wizard State to the canonical ClaimData the form-fill engine consumes.
// Shared so the claimant preview and the agent-side PDF generation stay identical.
export function toClaimData(s: State): ClaimData {
  const damageText = damageFocusText(s);
  return {
    // "unknown" (client isn't sure) is omitted like "" — absent means undetermined downstream.
    ...(s.insuranceType && s.insuranceType !== "unknown" ? { insurance_type: s.insuranceType } : {}),
    insured: {
      first_name: s.insured.first_name,
      last_name: s.insured.last_name,
      id_number: s.insured.id_number,
      mobile: s.insured.mobile,
      city: s.insured.city,
    },
    vehicle: {
      plate: s.vehicle.plate,
      manufacturer: s.vehicle.manufacturer,
      year: s.vehicle.year,
      type: "private",
    },
    accident: {
      date: s.accident.date,
      time: s.accident.time,
      location: accidentPlace(s),
      // The damage focus goes into the description too: not every form has a damage
      // cell, and the expert wants it on the notice either way. Unchanged when absent,
      // so the analysis-cache hash of older claims doesn't move.
      description: damageText
        ? [s.accident.description.trim(), damageText].filter(Boolean).join(" | ")
        : s.accident.description,
    },
    ...(damageText ? { damage: { insured_vehicle: damageText } } : {}),
    fault: s.fault ?? "unknown",
    // Third-party block — only when the claimant reported one. Was previously dropped here,
    // so it never reached the PDF or the AI analysis.
    ...(s.thirdParty.present
      ? {
          third_parties: allThirdParties(s).map((tp) => ({
            owner_name: tp.name,
            driver_name: tp.name,
            phone: tp.phone,
            vehicle_plate: tp.plate,
            insurer: tp.insurer,
          })),
        }
      : {}),
    // Driver — only once the "who was driving" question is answered. When the insured
    // drove, copy their identity into the driver section the forms expect. A parked
    // car had no driver, so the section stays empty on the form.
    ...(s.driver?.parked || s.driver?.isInsured == null
      ? {}
      : {
          driver: s.driver.isInsured
            ? {
                first_name: s.insured.first_name,
                last_name: s.insured.last_name,
                id_number: s.insured.id_number,
                relation_to_insured: "המבוטח",
              }
            : {
                first_name: s.driver.first_name,
                last_name: s.driver.last_name,
                id_number: s.driver.id_number,
                ...(s.driver.license_number ? { license_number: s.driver.license_number } : {}),
                ...(s.driver.relation_to_insured ? { relation_to_insured: s.driver.relation_to_insured } : {}),
              },
        }),
    // Insured declaration (bottom-of-form). signatory + date always; poa only when a TP exists.
    ...(s.declaration
      ? {
          declarations: {
            signatory_name: `${s.insured.first_name} ${s.insured.last_name}`.trim(),
            ...(s.declaration.signed_date ? { date: toILDate(s.declaration.signed_date) } : {}),
            data_consent: s.declaration.data_consent,
            ...(s.thirdParty.present ? { poa_third_party: s.declaration.poa_third_party } : {}),
          },
        }
      : {}),
  };
}
