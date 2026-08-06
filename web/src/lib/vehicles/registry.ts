// Vehicle lookup against the Ministry of Transport open-data registry
// (data.gov.il, "רכב פרטי ומסחרי"). The claimant already knows their plate by
// heart, so this replaces typing make/model/year — and, unlike OCR of the
// רישיון רכב, it sends no personal data anywhere: a plate number goes to a
// public government dataset that holds no owner identity.

// "רכב פרטי ומסחרי" resource id (data.gov.il datastore).
const RESOURCE_ID = "053cea08-09bc-40ec-8f7a-156f0677aff3";
const BASE = "https://data.gov.il/api/3/action/datastore_search";

export type VehicleInfo = {
  /** "יצרן ודגם" as one string, matching the wizard's single field. */
  description: string;
  /** Production year as a string, matching ClaimData.vehicle.year. */
  year?: string;
};

export function normalizePlate(plate: string): string {
  return plate.replace(/\D/g, "");
}

export function isLookupablePlate(plate: string): boolean {
  const digits = normalizePlate(plate);
  return digits.length >= 5 && digits.length <= 8;
}

// tozeret_nm carries an import-type suffix ("אלפא רומיאו_אי") that reads as
// noise on a form — keep only the manufacturer part.
function cleanManufacturer(value: unknown): string {
  return typeof value === "string" ? value.split("_")[0].trim() : "";
}

// Prefer the commercial name ("ALFA ROMEO 159", "TOYOTA COROLLA") — it is
// exactly "יצרן ודגם" in one string. Fall back to manufacturer + model code.
export function toVehicleInfo(record: unknown): VehicleInfo | null {
  if (typeof record !== "object" || record === null) return null;
  const r = record as Record<string, unknown>;
  const commercial = typeof r.kinuy_mishari === "string" ? r.kinuy_mishari.trim() : "";
  const manufacturer = cleanManufacturer(r.tozeret_nm);
  const model = typeof r.degem_nm === "string" ? r.degem_nm.trim() : "";
  const description = commercial || [manufacturer, model].filter(Boolean).join(" ").trim();
  if (!description) return null;
  const year =
    typeof r.shnat_yitzur === "number"
      ? String(r.shnat_yitzur)
      : typeof r.shnat_yitzur === "string" && r.shnat_yitzur.trim()
        ? r.shnat_yitzur.trim()
        : undefined;
  return year ? { description, year } : { description };
}

// Decide what the vehicle fields become after a registry hit. Auto-fill may
// write into an empty field, or replace a value this same mechanism wrote
// earlier (`previous`) — never over something the claimant typed themselves.
// Pure on purpose: this ran inside a setState updater once, and React's
// double-invocation turned it into an overwrite bug.
export function mergeVehicleInfo(
  current: { manufacturer: string; year: string },
  found: VehicleInfo,
  previous: { manufacturer: string; year: string } | null
): { manufacturer: string; year: string } {
  const manufacturer =
    !current.manufacturer.trim() || current.manufacturer === previous?.manufacturer
      ? found.description
      : current.manufacturer;
  const year =
    (!current.year.trim() || current.year === previous?.year) && found.year
      ? found.year
      : current.year;
  return { manufacturer, year };
}

export function lookupUrl(plate: string): string {
  const filters = encodeURIComponent(JSON.stringify({ mispar_rechev: Number(normalizePlate(plate)) }));
  return `${BASE}?resource_id=${RESOURCE_ID}&filters=${filters}&limit=1`;
}

// Returns null for "not found" as well as any failure — the caller treats both
// the same way: stay quiet, let the claimant type it themselves.
export async function lookupVehicle(plate: string): Promise<VehicleInfo | null> {
  if (!isLookupablePlate(plate)) return null;
  try {
    const res = await fetch(lookupUrl(plate), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { records?: unknown[] } };
    const record = json.result?.records?.[0];
    return record ? toVehicleInfo(record) : null;
  } catch {
    return null;
  }
}
