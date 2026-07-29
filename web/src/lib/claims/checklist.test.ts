import { describe, it, expect } from "vitest";
import { computeChecklist, type ClaimFlags } from "./checklist";

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

describe("computeChecklist — third_party_report is unaffected", () => {
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
});
