import { describe, expect, test } from "vitest";
import { planHandlingUpdate, type HandlingInput } from "./apply";

const NOW = new Date("2026-10-21T10:00:00Z");

function base(overrides: Partial<HandlingInput> = {}): HandlingInput {
  return {
    current: {
      handling_status: "sent",
      checklist_state: { submitted_to_tp_insurer: true },
      claim_type: "third_party_report",
      status: "checklist_active",
    },
    docs: [],
    now: NOW,
    ...overrides,
  };
}

describe("planHandlingUpdate — transitions", () => {
  test("sent → paid with a payment notice ticks payment_received", () => {
    const r = planHandlingUpdate({
      ...base({ docs: [{ type: "payment_notice" }] }),
      to: "paid",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.update.handling_status).toBe("paid");
    expect(r.update.handling_status_changed_at).toBe(NOW.toISOString());
    expect(r.milestoneTick).toBe("payment_received");
    expect(r.event.type).toBe("handling_changed");
    expect(r.event.payload).toMatchObject({ from: "sent", to: "paid" });
  });

  test("sent → paid without the doc errors in Hebrew naming הודעת תשלום", () => {
    const r = planHandlingUpdate({ ...base(), to: "paid" });
    expect("error" in r && r.error).toMatch(/הודעת תשלום/);
  });

  test("partial_paid with doc does NOT tick payment_received (claim stays open)", () => {
    const r = planHandlingUpdate({
      ...base({ docs: [{ type: "payment_notice" }] }),
      to: "partial_paid",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.milestoneTick).toBeUndefined();
  });

  test("rejected without rejection_letter errors; with it passes", () => {
    expect("error" in planHandlingUpdate({ ...base(), to: "rejected" })).toBe(true);
    const ok = planHandlingUpdate({
      ...base({ docs: [{ type: "rejection_letter" }] }),
      to: "rejected",
    });
    expect("error" in ok).toBe(false);
  });

  test("docs_requested without note errors; with note stores it on the event", () => {
    expect("error" in planHandlingUpdate({ ...base(), to: "docs_requested" })).toBe(true);
    const ok = planHandlingUpdate({ ...base(), to: "docs_requested", note: "חסר דוח שמאי" });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.event.payload).toMatchObject({ note: "חסר דוח שמאי" });
  });

  test("legal without lawyer errors; with lawyer stores it in summary patch", () => {
    const current = { ...base().current, handling_status: "rejected" };
    expect("error" in planHandlingUpdate({ ...base({ current }), to: "legal" })).toBe(true);
    const ok = planHandlingUpdate({
      ...base({ current }),
      to: "legal",
      lawyer: { name: "עו\"ד לוי", email: "levi@law.co.il" },
    });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.summaryPatch).toMatchObject({
      handling: { lawyer: { name: "עו\"ד לוי", email: "levi@law.co.il" } },
    });
  });

  test("illegal transition errors", () => {
    const current = { ...base().current, handling_status: "paid" };
    const r = planHandlingUpdate({ ...base({ current }), to: "sent" });
    expect("error" in r).toBe(true);
  });

  test("legacy claim (null column, milestone ticked) → paid succeeds via effective 'sent'", () => {
    const current = { ...base().current, handling_status: null };
    const r = planHandlingUpdate({
      ...base({ current, docs: [{ type: "payment_notice" }] }),
      to: "paid",
    });
    expect("error" in r).toBe(false);
  });

  test("never-sent claim cannot jump to paid", () => {
    const current = { ...base().current, handling_status: null, checklist_state: {} };
    const r = planHandlingUpdate({
      ...base({ current, docs: [{ type: "payment_notice" }] }),
      to: "paid",
    });
    expect("error" in r).toBe(true);
  });
});

describe("planHandlingUpdate — close", () => {
  test("close with reason produces status-closed update + closure patch", () => {
    const r = planHandlingUpdate({
      ...base(),
      close: { reason: "for_information", note: "נסגר לבקשת הלקוח" },
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.update.status).toBe("closed");
    expect(r.update.closed_at).toBe(NOW.toISOString());
    expect(r.summaryPatch).toMatchObject({
      handling: { closure: { reason: "for_information", note: "נסגר לבקשת הלקוח" } },
    });
    expect(r.event.type).toBe("claim_closed");
  });

  test("close with an unknown reason errors", () => {
    const r = planHandlingUpdate({
      ...base(),
      close: { reason: "whatever" as never },
    });
    expect("error" in r).toBe(true);
  });
});

describe("planHandlingUpdate — review fixes", () => {
  test("to:'sent' on a never-sent claim is refused (confirm route owns that move)", () => {
    const current = { ...base().current, handling_status: null, checklist_state: {} };
    const r = planHandlingUpdate({ ...base({ current }), to: "sent" });
    expect("error" in r).toBe(true);
  });

  test("revert on a sent claim clears the column and unticks the milestone", () => {
    const r = planHandlingUpdate({ ...base(), revert: true });
    if ("error" in r) throw new Error(r.error);
    expect(r.update.handling_status).toBeNull();
    expect(r.milestoneUntick).toBe("submitted_to_tp_insurer");
    expect(r.event.type).toBe("handling_reverted");
  });

  test("revert on a legacy sent claim (null column, ticked milestone) works too", () => {
    const current = { ...base().current, handling_status: null };
    const r = planHandlingUpdate({ ...base({ current }), revert: true });
    expect("error" in r).toBe(false);
  });

  test("revert is refused once past sent", () => {
    const current = { ...base().current, handling_status: "docs_requested" };
    const r = planHandlingUpdate({ ...base({ current }), revert: true });
    expect("error" in r).toBe(true);
  });
});

describe("planHandlingUpdate — revert cleanup", () => {
  test("revert asks the route to complete open follow-up tasks", () => {
    const r = planHandlingUpdate({ ...base(), revert: true });
    if ("error" in r) throw new Error(r.error);
    expect(r.completeFollowUps).toBe(true);
  });
  test("ordinary transitions do not", () => {
    const r = planHandlingUpdate({
      ...base({ docs: [{ type: "payment_notice" }] }),
      to: "partial_paid",
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.completeFollowUps).toBeUndefined();
  });
});
