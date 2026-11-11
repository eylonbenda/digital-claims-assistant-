import { describe, it, expect } from "vitest";
import { computeChecklist, chaseableLabels, chaseItemLabels, satisfiedDocTypes, type ClaimFlags } from "./checklist";

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

describe("computeChecklist — third_party_report document timing", () => {
  const items = computeChecklist("third_party_report", new Set(), false, {}, NO_FLAGS);
  const item = (key: string) => items.find((i) => i.key === key);

  it("asks for אישור אי-הגשה at the start and keeps it blocking", () => {
    expect(item("no_claim_confirmation")).toMatchObject({ section: "base", mandatory: true, blocking: true });
  });

  it("asks for עבר ביטוחי at the start as required, without gating submission", () => {
    expect(item("insurance_history")).toMatchObject({ section: "base", mandatory: true, blocking: false });
  });

  it("treats the bank / account confirmation as optional", () => {
    expect(item("bank_details")).toMatchObject({ mandatory: false, blocking: false });
  });

  it("keeps אישור הפסדים post-repair: it depends on the client's own insurer paying out", () => {
    const activated = computeChecklist(
      "third_party_report", new Set(), false, {}, { ...NO_FLAGS, policy_activated: true },
    );
    expect(activated.find((i) => i.key === "loss_confirmation")).toMatchObject({ section: "late", mandatory: true });
  });
});

describe("chaseItemLabels", () => {
  it("asks the client for blocking docs and for required start-of-claim docs that don't block", () => {
    const items = computeChecklist("third_party_report", new Set(), false, {}, NO_FLAGS);
    const labels = chaseItemLabels(items);
    expect(labels).toContain("אישור אי-הגשת תביעה");
    expect(labels).toContain("עבר ביטוחי");
  });

  it("never asks for the demand letter, the generated form, or optional docs", () => {
    const items = computeChecklist("third_party_report", new Set(), false, {}, NO_FLAGS);
    const labels = chaseItemLabels(items);
    expect(labels).not.toContain("מכתב דרישה");
    expect(labels).not.toContain("טופס הודעה על תאונה");
    expect(labels).not.toContain("פרטי חשבון בנק");
  });

  it("drops a doc once it is on file", () => {
    const items = computeChecklist("third_party_report", new Set(["insurance_history"]), false, {}, NO_FLAGS);
    expect(chaseItemLabels(items)).not.toContain("עבר ביטוחי");
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

describe("satisfiedDocTypes — both sides of the licence", () => {
  const NEW = "2026-10-05T09:00:00Z"; // after BOTH_SIDES_LICENCE_FROM
  const OLD = "2026-09-01T09:00:00Z"; // a pilot claim from before the rule
  const d = (type: string) => ({ type });

  it("needs two licence images on a claim opened under the rule", () => {
    expect(satisfiedDocTypes([d("drivers_license")], NEW).has("drivers_license")).toBe(false);
    expect(
      satisfiedDocTypes([d("drivers_license"), d("drivers_license")], NEW).has("drivers_license"),
    ).toBe(true);
  });

  it("leaves every other document at one", () => {
    const s = satisfiedDocTypes([d("vehicle_reg"), d("car_photo")], NEW);
    expect(s.has("vehicle_reg")).toBe(true);
    expect(s.has("car_photo")).toBe(true);
  });

  // The ~50 pilot claims must not all flip back to incomplete and reopen their chases.
  it("accepts a single licence image on a claim opened before the rule", () => {
    expect(satisfiedDocTypes([d("drivers_license")], OLD).has("drivers_license")).toBe(true);
  });

  it("treats a missing or unparseable date as legacy", () => {
    expect(satisfiedDocTypes([d("drivers_license")]).has("drivers_license")).toBe(true);
    expect(satisfiedDocTypes([d("drivers_license")], null).has("drivers_license")).toBe(true);
    expect(satisfiedDocTypes([d("drivers_license")], "not-a-date").has("drivers_license")).toBe(true);
  });

  it("omits types with no uploads at all", () => {
    expect(satisfiedDocTypes([], NEW).size).toBe(0);
  });

  // The point of threading this through: one side must not close the chase task.
  it("keeps the licence blocking in the checklist until both sides are in", () => {
    const one = computeChecklist("own_policy", satisfiedDocTypes([d("drivers_license")], NEW), false, {}, NO_FLAGS);
    expect(one.find((i) => i.key === "drivers_license")!.done).toBe(false);

    const both = computeChecklist(
      "own_policy",
      satisfiedDocTypes([d("drivers_license"), d("drivers_license")], NEW),
      false,
      {},
      NO_FLAGS,
    );
    expect(both.find((i) => i.key === "drivers_license")!.done).toBe(true);
  });
});

describe("computeChecklist — generated demand form", () => {
  it("a demand form does not satisfy accident_form but does satisfy demand_form", () => {
    const items = computeChecklist("third_party_report", new Set(["demand_form"]), false, {}, NO_FLAGS);
    expect(items.find((i) => i.key === "accident_form")?.done).toBe(false);
    expect(items.find((i) => i.key === "demand_form")?.done).toBe(true);
  });
});
