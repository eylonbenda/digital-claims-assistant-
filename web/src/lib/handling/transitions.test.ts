import { describe, expect, test } from "vitest";
import {
  canTransition,
  requirementFor,
  isSystemMilestone,
  sentMilestoneFor,
  type HandlingStatus,
} from "./transitions";

describe("canTransition", () => {
  const allowed: [HandlingStatus | null, HandlingStatus][] = [
    [null, "sent"],
    ["sent", "docs_requested"],
    ["docs_requested", "sent"],
    ["sent", "approved_awaiting_payment"],
    ["sent", "partial_paid"],
    ["sent", "paid"],
    ["sent", "rejected"],
    ["docs_requested", "approved_awaiting_payment"],
    ["docs_requested", "partial_paid"],
    ["docs_requested", "paid"],
    ["docs_requested", "rejected"],
    ["approved_awaiting_payment", "partial_paid"],
    ["approved_awaiting_payment", "paid"],
    ["approved_awaiting_payment", "rejected"],
    ["partial_paid", "paid"],
    ["partial_paid", "appeal"],
    ["rejected", "appeal"],
    ["rejected", "legal"],
    ["appeal", "paid"],
    ["appeal", "partial_paid"],
    ["appeal", "rejected"],
    ["appeal", "legal"],
    ["legal", "paid"],
    ["legal", "partial_paid"],
  ];
  test.each(allowed)("%s → %s allowed", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const forbidden: [HandlingStatus | null, HandlingStatus][] = [
    [null, "paid"],
    [null, "rejected"],
    ["paid", "sent"],
    ["paid", "rejected"],
    ["rejected", "paid"],
    ["partial_paid", "rejected"],
    ["sent", "appeal"],
    ["sent", "legal"],
    ["approved_awaiting_payment", "sent"],
  ];
  test.each(forbidden)("%s → %s forbidden", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("requirementFor", () => {
  test("paid and partial_paid need a payment notice", () => {
    expect(requirementFor("paid")).toEqual({ evidenceDoc: "payment_notice" });
    expect(requirementFor("partial_paid")).toEqual({ evidenceDoc: "payment_notice" });
  });
  test("rejected needs the rejection letter", () => {
    expect(requirementFor("rejected")).toEqual({ evidenceDoc: "rejection_letter" });
  });
  test("docs_requested and appeal need a note", () => {
    expect(requirementFor("docs_requested")).toEqual({ note: true });
    expect(requirementFor("appeal")).toEqual({ note: true });
  });
  test("legal needs lawyer details", () => {
    expect(requirementFor("legal")).toEqual({ lawyer: true });
  });
  test("sent and approved_awaiting_payment need nothing", () => {
    expect(requirementFor("sent")).toEqual({});
    expect(requirementFor("approved_awaiting_payment")).toEqual({});
  });
});

describe("isSystemMilestone", () => {
  test("the four system milestones", () => {
    for (const k of [
      "submitted_to_insurer",
      "submitted_to_tp_insurer",
      "approval_requested",
      "payment_received",
    ]) {
      expect(isSystemMilestone(k)).toBe(true);
    }
  });
  test("agent-owned milestones stay manual", () => {
    expect(isSystemMilestone("car_at_garage")).toBe(false);
    expect(isSystemMilestone("route_approved")).toBe(false);
  });
});

describe("sentMilestoneFor", () => {
  test("maps each track to its sent milestone", () => {
    expect(sentMilestoneFor("own_policy")).toBe("submitted_to_insurer");
    expect(sentMilestoneFor("third_party_report")).toBe("submitted_to_tp_insurer");
    expect(sentMilestoneFor("third_party_settlement")).toBe("approval_requested");
    expect(sentMilestoneFor("unknown")).toBeNull();
  });
});
