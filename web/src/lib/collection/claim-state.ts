import type { ClaimData, Fault, InsuranceType } from "@/lib/formfill/types";

// The wizard's working shape. Persisted verbatim to `claims.summary_json.collected`
// at submit, so the agent side can re-derive the canonical ClaimData server-side.
export type DocType = "car_photo" | "drivers_license" | "vehicle_reg";
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
  policyInsurer: string; // the claimant's own insurer (drives which accident-notice form gets filled)
  insuranceType: InsuranceType | ""; // מקיף / חובה / צד ג' — pivots own_policy viability
  insured: { first_name: string; last_name: string; id_number: string; mobile: string; city: string };
  vehicle: { plate: string; manufacturer: string; year: string };
  accident: { date: string; time: string; location: string; description: string };
  fault: Fault | null;
  thirdParty: { present: boolean | null; name: string; phone: string; plate: string; insurer: string };
  documents: UploadedDoc[];
};

// Israeli insurers. `templated` = we have a coordinate template, so the form auto-fills.
// Others are still selectable (persisted), but the agent fills the form manually for now.
export const INSURERS: { key: string; label: string; templated: boolean }[] = [
  { key: "migdal", label: "מגדל", templated: true },
  { key: "menora", label: "מנורה", templated: true },
  { key: "hachshara", label: "הכשרה", templated: true },
  { key: "harel", label: "הראל", templated: false },
  { key: "clal", label: "כלל", templated: false },
  { key: "phoenix", label: "הפניקס", templated: false },
  { key: "ayalon", label: "איילון", templated: false },
  { key: "shlomo", label: "שלמה", templated: false },
  { key: "libra", label: "ליברה", templated: false },
  { key: "aig", label: "AIG", templated: false },
];

// Maps the wizard State to the canonical ClaimData the form-fill engine consumes.
// Shared so the claimant preview and the agent-side PDF generation stay identical.
export function toClaimData(s: State): ClaimData {
  return {
    ...(s.insuranceType ? { insurance_type: s.insuranceType } : {}),
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
  };
}
