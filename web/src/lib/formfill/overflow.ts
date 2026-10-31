import type { ClaimData, ThirdParty } from "./types";

// Multi-car accidents (pilot, 2026-10-31): a form with fewer third-party rows than the
// claim has vehicles must not drop the rest silently — the operator was writing the
// second vehicle onto the form by hand. Vehicles past the template's last mapped
// third_parties.N row are appended to the accident description, the one free-text
// cell every form has, as "מעורב נוסף: <plate>, <name>, <insurer>".

// Third-party rows a template draws: 1 + the highest N in its third_parties.N.* keys.
export function thirdPartySlots(keys: string[]): number {
  let max = -1;
  for (const k of keys) {
    const m = /^third_parties\.(\d+)\./.exec(k);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

const overflowLine = (tp: ThirdParty) => {
  const parts = [tp.vehicle_plate, tp.owner_name || tp.driver_name, tp.insurer].filter(
    (v): v is string => !!v && v.trim() !== "",
  );
  return parts.length ? `מעורב נוסף: ${parts.join(", ")}` : "";
};

// Returns `data` with any third parties past `slots` folded into accident.description.
// Unchanged when everything fits. Never mutates the input.
export function foldOverflowThirdParties(data: ClaimData, slots: number): ClaimData {
  const extra = (data.third_parties ?? []).slice(slots).map(overflowLine).filter(Boolean);
  if (!extra.length) return data;
  const description = [data.accident?.description?.trim(), ...extra].filter(Boolean).join(" | ");
  return { ...data, accident: { ...data.accident, description } };
}
