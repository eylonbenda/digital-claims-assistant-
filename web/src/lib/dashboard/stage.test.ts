import { describe, expect, it } from "vitest";
import { claimStage } from "./stage";

const base = { status: "form_generated", submitted_at: "2026-10-20T10:00:00Z", handling_effective: null as string | null };

describe("claimStage", () => {
  it.each(["closed", "abandoned"])("status %s → closed, whatever else is set", (status) => {
    expect(claimStage({ status, submitted_at: null, handling_effective: "sent" })).toBe("closed");
  });
  it("paid → closed even if status is still open", () => {
    expect(claimStage({ ...base, handling_effective: "paid" })).toBe("closed");
  });
  it.each(["sent", "docs_requested", "rejected", "appeal", "legal"])("%s → sent", (h) => {
    expect(claimStage({ ...base, handling_effective: h })).toBe("sent");
  });
  it.each(["approved_awaiting_payment", "partial_paid"])("%s → awaiting_payment", (h) => {
    expect(claimStage({ ...base, handling_effective: h })).toBe("awaiting_payment");
  });
  it("handling status outranks a missing submit → sent", () => {
    expect(claimStage({ ...base, submitted_at: null, handling_effective: "sent" })).toBe("sent");
  });
  it("no submit, no handling → with_client", () => {
    expect(claimStage({ ...base, submitted_at: null })).toBe("with_client");
  });
  it("submitted, no handling → before_send", () => {
    expect(claimStage(base)).toBe("before_send");
  });
});
