import { describe, expect, test } from "vitest";
import { emailTargets, canUnassign, isPendingEmail, prefillNote } from "./pending";

const inbound = { direction: "inbound" as const, handled_at: null };
const sentClaim = { handlingEffective: "sent" as const, closed: false };

describe("isPendingEmail", () => {
  test("an unhandled inbound email on a sent claim is pending", () => {
    expect(isPendingEmail(inbound, sentClaim)).toBe(true);
  });

  test("outbound mail is never pending", () => {
    expect(isPendingEmail({ direction: "outbound", handled_at: null }, sentClaim)).toBe(false);
  });

  test("a handled email is not pending", () => {
    expect(isPendingEmail({ ...inbound, handled_at: "2026-11-22T10:00:00Z" }, sentClaim)).toBe(false);
  });

  test("mail on a claim that was never sent is not pending", () => {
    expect(isPendingEmail(inbound, { handlingEffective: null, closed: false })).toBe(false);
  });

  test("mail on a closed claim is not pending", () => {
    expect(isPendingEmail(inbound, { handlingEffective: "paid", closed: true })).toBe(false);
  });
});

describe("emailTargets", () => {
  test("from sent: every insurer answer", () => {
    expect(emailTargets("sent")).toEqual([
      "docs_requested", "approved_awaiting_payment", "partial_paid", "paid", "rejected",
    ]);
  });

  test("from docs_requested: 'sent' is the business's move and is left out", () => {
    expect(emailTargets("docs_requested")).not.toContain("sent");
    expect(emailTargets("docs_requested")).toContain("rejected");
  });

  test("nothing before the claim is sent, nothing after full payment", () => {
    expect(emailTargets(null)).toEqual([]);
    expect(emailTargets("paid")).toEqual([]);
  });
});

describe("prefillNote", () => {
  test("trims and collapses blank runs", () => {
    expect(prefillNote("  שלום,\r\n\r\n\r\n\r\nנא לשלוח דוח שמאי  ")).toBe("שלום,\n\nנא לשלוח דוח שמאי");
  });

  test("cuts a long body at the limit with an ellipsis", () => {
    const out = prefillNote("א".repeat(700), 600);
    expect(out).toHaveLength(601);
    expect(out.endsWith("…")).toBe(true);
  });

  test("no body → empty", () => {
    expect(prefillNote(null)).toBe("");
  });
});

describe("canUnassign", () => {
  test("lets an inbound email go back to the inbox while no status was set from it", () => {
    expect(canUnassign({ direction: "inbound", handled_as: null })).toBe(true);
    expect(canUnassign({ direction: "inbound", handled_as: "none" })).toBe(true);
  });

  test("keeps an email the status was set from, and anything we sent", () => {
    expect(canUnassign({ direction: "inbound", handled_as: "in_review" })).toBe(false);
    expect(canUnassign({ direction: "outbound", handled_as: null })).toBe(false);
  });
});
