import { describe, expect, it } from "vitest";
import { followupFields } from "./followup-fields";
import {
  ALL_TRACK_ITEMS,
  CLIENT_UPLOAD_DOC_TYPES,
  chaseItemLabels,
  chaseItems,
  computeChecklist,
  missingLateDocItems,
  type ClaimFlags,
} from "@/lib/claims/checklist";

const NO_FLAGS: ClaimFlags = {
  theft: false, lien: false, business_use: false, policy_activated: false, garage_network_rider: false,
};
const TRACKS = ["own_policy", "third_party_report", "third_party_settlement", "unknown"] as const;
const FLAG_KEYS = Object.keys(NO_FLAGS) as (keyof ClaimFlags)[];
// All 32 flag combinations.
const FLAG_COMBOS: ClaimFlags[] = Array.from({ length: 1 << FLAG_KEYS.length }, (_, n) =>
  Object.fromEntries(FLAG_KEYS.map((k, i) => [k, !!(n & (1 << i))])) as ClaimFlags,
);

const types = (claimType: string | null, flags: Partial<ClaimFlags> = {}, have: string[] = []) =>
  followupFields(claimType, { ...NO_FLAGS, ...flags }, new Set(have)).map((f) => f.type);

describe("followupFields covers every chased document", () => {
  it.each(TRACKS)("%s: every doc any chase message can ask for is on the link and accepted by the route", (track) => {
    for (const flags of FLAG_COMBOS) {
      const checklist = computeChecklist(track, new Set(), false, {}, flags);
      // Both outbound bodies: chase_missing_docs and collect_private_report_docs.
      // The cockpit's ad-hoc chase asks for blocking docs only — a subset of chaseItems.
      const chased = [...chaseItems(checklist), ...missingLateDocItems(checklist)];
      const offered = types(track, flags);
      for (const item of chased) {
        expect(CLIENT_UPLOAD_DOC_TYPES, `${track} ${JSON.stringify(flags)}`).toContain(item.docType);
        expect(offered, `${track} ${JSON.stringify(flags)}`).toContain(item.docType);
      }
      // Labels come from the same items, so a named label always maps to a field.
      expect(chaseItemLabels(checklist)).toEqual(chaseItems(checklist).map((i) => i.label));
    }
  });

  it("offers the post-repair docs the private-report chase asks for", () => {
    expect(types("third_party_report")).toEqual(
      expect.arrayContaining([
        "no_claim_confirmation", "insurance_history", "appraiser_report", "garage_invoice",
        "repair_receipt", "assessor_fee_invoice", "assessor_fee_receipt",
      ]),
    );
    expect(types("own_policy")).toEqual(
      expect.arrayContaining(["drivers_license", "vehicle_reg", "appraiser_report", "garage_invoice", "bank_details"]),
    );
  });

  it("swaps אישור אי-הגשה for אישור הפסדים once the client's own policy was activated", () => {
    const fields = types("third_party_report", { policy_activated: true });
    expect(fields).not.toContain("no_claim_confirmation");
    expect(fields).toContain("loss_confirmation");
    expect(fields).toContain("insurance_history");
  });

  it("offers own_policy conditional docs only when their circumstance is flagged", () => {
    expect(types("own_policy")).not.toEqual(expect.arrayContaining(["police_report"]));
    expect(types("own_policy", { theft: true })).toEqual(expect.arrayContaining(["police_report", "keys"]));
    expect(types("own_policy", { lien: true })).toContain("lien_release");
  });

  it("never offers the demand letter — the agent drafts it", () => {
    for (const track of TRACKS) for (const flags of FLAG_COMBOS) {
      expect(types(track, flags)).not.toContain("demand_form");
    }
  });

  it("hides documents already on file but keeps car photos and the third-party bucket", () => {
    const fields = types("third_party_settlement", {}, ["vehicle_reg", "car_photo", "no_claim_confirmation"]);
    expect(fields).toEqual(["car_photo", "third_party_doc"]);
  });

  it("falls back to the unknown track for an unclassified claim", () => {
    expect(types(null)).toEqual(["car_photo", "drivers_license", "vehicle_reg", "third_party_doc"]);
  });
});

describe("CLIENT_UPLOAD_DOC_TYPES", () => {
  it("excludes every type a track marks clientSuppliable: false", () => {
    const agentOnly = ALL_TRACK_ITEMS.filter((i) => i.clientSuppliable === false).map((i) => i.docType);
    expect(agentOnly).toContain("demand_form");
    for (const t of agentOnly) expect(CLIENT_UPLOAD_DOC_TYPES).not.toContain(t);
  });

  it("keeps the wizard's own upload types", () => {
    for (const t of ["car_photo", "drivers_license", "vehicle_reg", "third_party_doc"]) {
      expect(CLIENT_UPLOAD_DOC_TYPES).toContain(t);
    }
  });
});
