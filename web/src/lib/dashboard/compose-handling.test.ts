import { describe, expect, test } from "vitest";
import { composeDashboard, type ComposeClaim } from "./compose";
import { handlingLine } from "./copy";

const NOW = new Date("2026-10-21T10:00:00Z");

function claim(overrides: Partial<ComposeClaim> = {}): ComposeClaim {
  return {
    id: "c1",
    client_name: "דור",
    claim_type: "third_party_report",
    status: "checklist_active",
    submitted_at: "2026-10-01T10:00:00Z",
    created_at: "2026-10-01T09:00:00Z",
    phone: "0520000000",
    urgent: false,
    access_token: "tok",
    client_plate: null,
    tp_plates: [],
    ...overrides,
  };
}

describe("handlingLine", () => {
  test("sent with insurer + days", () => {
    expect(handlingLine("sent", "הפניקס", 12)).toBe("נשלחה להפניקס · ממתינים 12 ימים");
  });
  test("sent without insurer, zero days", () => {
    expect(handlingLine("sent", null, 0)).toBe("נשלחה למבטחת");
  });
  test("docs_requested / rejected", () => {
    expect(handlingLine("docs_requested", null, 3)).toBe("המבטחת ביקשה השלמות");
    expect(handlingLine("rejected", null, 0)).toBe("נדחתה — לטפל בערעור");
  });
});

describe("composeDashboard — handling waiting line", () => {
  test("a sent claim's card carries the handling line", () => {
    const cards = composeDashboard({
      claims: [
        claim({
          handling_effective: "sent",
          handling_insurer_label: "הפניקס",
          handling_days: 12,
        }),
      ],
      queue: null,
      brief: null,
      openTasks: [],
      now: NOW,
    });
    expect(cards[0].action_line).toBe("נשלחה להפניקס · ממתינים 12 ימים");
  });

  test("an unsent claim is unchanged", () => {
    const cards = composeDashboard({
      claims: [claim()],
      queue: null,
      brief: null,
      openTasks: [],
      now: NOW,
    });
    expect(cards[0].action_line).not.toContain("נשלחה");
  });
});
