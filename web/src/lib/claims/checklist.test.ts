import { describe, it, expect } from "vitest";
import { computeChecklist, chaseableLabels, type ClaimFlags } from "./checklist";

const NO_FLAGS: ClaimFlags = {
  theft: false, lien: false, business_use: false,
  policy_activated: false, garage_network_rider: false,
};

function ownPolicy(over: Partial<ClaimFlags> = {}) {
  return computeChecklist("own_policy", new Set(), false, {}, { ...NO_FLAGS, ...over });
}

const blockingKeys = (items: { key: string; blocking: boolean; done: boolean }[]) =>
  items.filter((i) => i.blocking && !i.done).map((i) => i.key);

describe("computeChecklist — own_policy conditional docs", () => {
  it("does not block on conditional docs when no circumstance flag is set", () => {
    const keys = blockingKeys(ownPolicy());
    expect(keys).not.toContain("police_report");
    expect(keys).not.toContain("keys");
    expect(keys).not.toContain("lien_release");
    // The base docs still block — this narrows the rule, it doesn't disable readiness.
    expect(keys).toContain("accident_form");
    expect(keys).toContain("drivers_license");
    expect(keys).toContain("vehicle_reg");
  });

  it("keeps the conditional items listed so the agent can still act on them", () => {
    const listed = ownPolicy().map((i) => i.key);
    expect(listed).toEqual(expect.arrayContaining(["police_report", "keys", "lien_release"]));
  });

  it("blocks on the police report and keys once theft is flagged", () => {
    const keys = blockingKeys(ownPolicy({ theft: true }));
    expect(keys).toContain("police_report");
    expect(keys).toContain("keys");
    expect(keys).not.toContain("lien_release");
  });

  it("blocks on the lien release only when the vehicle is flagged as encumbered", () => {
    const keys = blockingKeys(ownPolicy({ lien: true }));
    expect(keys).toContain("lien_release");
    expect(keys).not.toContain("police_report");
  });

  it("clears the blocking conditional once the document is uploaded", () => {
    const items = computeChecklist(
      "own_policy", new Set(["police_report", "keys"]), false, {},
      { ...NO_FLAGS, theft: true },
    );
    expect(blockingKeys(items)).not.toContain("police_report");
    expect(items.find((i) => i.key === "keys")?.done).toBe(true);
  });
});

describe("computeChecklist — third_party_report", () => {
  it("lists the repair receipt as required but does not let it gate readiness", () => {
    const items = computeChecklist("third_party_report", new Set(), false, {}, NO_FLAGS);
    const receipt = items.find((i) => i.key === "repair_receipt");
    expect(receipt?.mandatory).toBe(true);
    expect(receipt?.blocking).toBe(false);
    // The invoice it's paired with still blocks — only the receipt was relaxed.
    expect(blockingKeys(items)).toContain("garage_invoice");
  });

  it("still swaps no_claim_confirmation for loss_confirmation on policy_activated", () => {
    const off = computeChecklist("third_party_report", new Set(), false, {}, NO_FLAGS);
    expect(off.map((i) => i.key)).toContain("no_claim_confirmation");
    expect(off.map((i) => i.key)).not.toContain("loss_confirmation");

    const on = computeChecklist(
      "third_party_report", new Set(), false, {}, { ...NO_FLAGS, policy_activated: true },
    );
    expect(on.map((i) => i.key)).not.toContain("no_claim_confirmation");
    expect(on.find((i) => i.key === "loss_confirmation")?.mandatory).toBe(true);
  });

  it("marks demand_form as not client-suppliable — the agent drafts and sends this demand letter, not the client", () => {
    const items = computeChecklist("third_party_report", new Set(), false, {}, NO_FLAGS);
    expect(items.find((i) => i.key === "demand_form")?.clientSuppliable).toBe(false);
    // appraiser_report stays client-suppliable: on third_party_report the client
    // commissions and pays the private appraiser and is exactly who holds and
    // forwards the report (field absent = client-suppliable).
    expect(items.find((i) => i.key === "appraiser_report")?.clientSuppliable).toBeUndefined();
    // Ordinary client-photographed docs are unaffected too.
    expect(items.find((i) => i.key === "car_photo")?.clientSuppliable).toBeUndefined();
  });
});

describe("chaseableLabels", () => {
  it("keeps a blocking doc the client can supply", () => {
    expect(chaseableLabels([{ kind: "doc", label: "רישיון רכב" }])).toEqual(["רישיון רכב"]);
  });

  it("excludes a doc the agent produces (clientSuppliable: false), e.g. demand_form", () => {
    expect(
      chaseableLabels([{ kind: "doc", label: "מכתב דרישה", clientSuppliable: false }]),
    ).toEqual([]);
  });

  it("keeps appraiser_report — the client commissions and holds the private appraiser's report", () => {
    expect(chaseableLabels([{ kind: "doc", label: "דוח שמאי" }])).toEqual(["דוח שמאי"]);
  });

  it("excludes form and milestone kinds regardless of clientSuppliable", () => {
    expect(
      chaseableLabels([
        { kind: "form", label: "טופס הודעה על תאונה" },
        { kind: "milestone", label: "רכב נכנס למוסך" },
      ]),
    ).toEqual([]);
  });
});
