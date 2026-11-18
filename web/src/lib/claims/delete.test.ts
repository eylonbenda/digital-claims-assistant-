import { describe, expect, it } from "vitest";
import { sentMilestoneFor } from "@/lib/handling/transitions";
import { DELETE_BLOCKED_MESSAGE, deleteBlocker } from "./delete";

const fresh = {
  handlingStatus: null,
  checklistState: {},
  claimType: "own_policy" as const,
  hasOutboundEmail: false,
};

describe("deleteBlocker", () => {
  it("allows a claim that was never sent", () => {
    expect(deleteBlocker(fresh)).toBeNull();
    expect(deleteBlocker({ ...fresh, claimType: "unknown", checklistState: null })).toBeNull();
  });

  it("blocks once the claim has a handling status", () => {
    expect(deleteBlocker({ ...fresh, handlingStatus: "sent" })).toBe("sent");
    expect(deleteBlocker({ ...fresh, handlingStatus: "paid" })).toBe("sent");
  });

  it("blocks a legacy claim sent by hand (milestone ticked, no status column)", () => {
    const milestone = sentMilestoneFor("own_policy")!;
    expect(deleteBlocker({ ...fresh, checklistState: { [milestone]: true } })).toBe("sent");
  });

  it("blocks when an email already went out on the claim", () => {
    expect(deleteBlocker({ ...fresh, hasOutboundEmail: true })).toBe("emailed");
  });

  it("has a message for every blocker", () => {
    expect(DELETE_BLOCKED_MESSAGE.sent).toContain("סגירה");
    expect(DELETE_BLOCKED_MESSAGE.emailed).toContain("סגירה");
  });
});
