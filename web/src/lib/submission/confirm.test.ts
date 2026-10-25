import { describe, expect, test } from "vitest";
import { validRecipient, planConfirm } from "./confirm";

describe("validRecipient", () => {
  test("trims and accepts a plausible address", () => {
    expect(validRecipient(" a@b.co ")).toBe("a@b.co");
  });
  test("rejects junk", () => {
    expect(validRecipient("not-an-email")).toBeNull();
    expect(validRecipient("a @b.co")).toBeNull();
    expect(validRecipient("a@b")).toBeNull();
    expect(validRecipient("")).toBeNull();
  });
});

describe("planConfirm", () => {
  const NOW = new Date("2026-10-21T10:00:00Z");
  const base = {
    recipient: "claims@insurer.co.il",
    subject: "תביעה — 4834834",
    insurerKey: "phoenix" as string | undefined,
    current: {
      claim_type: "third_party_report" as const,
      handling_status: null as string | null,
      checklist_state: {} as Record<string, boolean>,
    },
    now: NOW,
  };

  test("third_party_report: ticks submitted_to_tp_insurer, sets sent, persists insurer", () => {
    const r = planConfirm(base);
    if ("error" in r) throw new Error(r.error);
    expect(r.milestone).toBe("submitted_to_tp_insurer");
    expect(r.update.handling_status).toBe("sent");
    expect(r.update.handling_status_changed_at).toBe(NOW.toISOString());
    expect(r.update.at_fault_insurer).toBe("phoenix");
    expect(r.event.type).toBe("submission_confirmed");
    expect(r.event.payload).toMatchObject({
      recipient: "claims@insurer.co.il",
      subject: "תביעה — 4834834",
    });
  });

  test("own_policy ticks submitted_to_insurer and never writes at_fault_insurer", () => {
    const r = planConfirm({
      ...base,
      current: { ...base.current, claim_type: "own_policy" },
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.milestone).toBe("submitted_to_insurer");
    expect(r.update.at_fault_insurer).toBeUndefined();
  });

  test("settlement ticks approval_requested", () => {
    const r = planConfirm({
      ...base,
      current: { ...base.current, claim_type: "third_party_settlement" },
    });
    if ("error" in r) throw new Error(r.error);
    expect(r.milestone).toBe("approval_requested");
  });

  test("unknown track refused", () => {
    const r = planConfirm({
      ...base,
      current: { ...base.current, claim_type: "unknown" },
    });
    expect("error" in r).toBe(true);
  });

  test("already sent (column) refused", () => {
    const r = planConfirm({
      ...base,
      current: { ...base.current, handling_status: "sent" },
    });
    expect("error" in r).toBe(true);
  });

  test("already sent (legacy milestone tick) refused", () => {
    const r = planConfirm({
      ...base,
      current: { ...base.current, checklist_state: { submitted_to_tp_insurer: true } },
    });
    expect("error" in r).toBe(true);
  });

  test("bad recipient refused", () => {
    const r = planConfirm({ ...base, recipient: "nope" });
    expect("error" in r).toBe(true);
  });
});
