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
// `appliesTo` carries the case the request doesn't cover: when the car was hit while
// parked there was no driver, so there is no licence to ask for. Requiring one would
// hard-block exactly the scenario PR #50 added an escape hatch for.
export const REQUIRED_DOCS: RequiredDocSpec[] = [
  { type: "drivers_license", min: 2, appliesTo: (s) => !s.driver?.parked },
  { type: "vehicle_reg", min: 1, appliesTo: () => true },
];
export type UploadedDoc = {
  localId: string;
  type: DocType;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
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
  accident: { date: string; time: string; location: string; description: string };
  fault: Fault | null;
  // details_unknown: the client can't identify the other side (e.g. hit-and-run) —
  // unblocks the wizard while keeping whatever partial details they do have.
  thirdParty: { present: boolean | null; details_unknown?: boolean; name: string; phone: string; plate: string; insurer: string };
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
];

// Maps the wizard State to the canonical ClaimData the form-fill engine consumes.
// Shared so the claimant preview and the agent-side PDF generation stay identical.
export function toClaimData(s: State): ClaimData {
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
      location: s.accident.location,
      description: s.accident.description,
    },
    fault: s.fault ?? "unknown",
    // Third-party block — only when the claimant reported one. Was previously dropped here,
    // so it never reached the PDF or the AI analysis.
    ...(s.thirdParty.present
      ? {
          third_parties: [
            {
              owner_name: s.thirdParty.name,
              driver_name: s.thirdParty.name,
              phone: s.thirdParty.phone,
              vehicle_plate: s.thirdParty.plate,
              insurer: s.thirdParty.insurer,
            },
          ],
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
