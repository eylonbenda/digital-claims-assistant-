import { describe, it, expect } from "vitest";
import { computeChecklist } from "@/lib/claims/checklist";

describe("test infra", () => {
  it("resolves the @ alias and runs", () => {
    const items = computeChecklist("unknown", new Set(), false, {}, {
      theft: false, lien: false, business_use: false,
      policy_activated: false, garage_network_rider: false,
    });
    expect(items.length).toBeGreaterThan(0);
  });
});
