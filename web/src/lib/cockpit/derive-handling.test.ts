import { describe, expect, test } from "vitest";
import { deriveCockpit, type CockpitInput } from "./derive";

const NOW = new Date("2026-10-21T10:00:00Z");

function input(overrides: Partial<CockpitInput> = {}): CockpitInput {
  return {
    classificationNeedsAttention: false,
    classificationUnconfirmed: false,
    blocking: [],
    chaseLabels: [],
    tasks: [],
    missingFieldCount: 0,
    hasGeneratedForm: true,
    nextMilestone: null,
    insurerLabel: "הפניקס",
    docsCount: 3,
    handlingEffective: null,
    submissionReady: false,
    handlingOverdue: false,
    ...overrides,
  };
}

describe("deriveCockpit — handling next-actions", () => {
  test("submittable + unsent → prepare_submission", () => {
    const { nextAction } = deriveCockpit(input({ submissionReady: true }), NOW);
    expect(nextAction.kind).toBe("prepare_submission");
    expect(nextAction.targetTab).toBe("work");
  });

  test("prepare_submission loses to classify and to chase", () => {
    expect(
      deriveCockpit(input({ submissionReady: true, classificationUnconfirmed: true }), NOW)
        .nextAction.kind,
    ).toBe("classify");
    expect(
      deriveCockpit(input({ submissionReady: true, chaseLabels: ["רישיון נהיגה"] }), NOW)
        .nextAction.kind,
    ).toBe("chase");
  });

  test("prepare_submission beats an open task", () => {
    const { nextAction } = deriveCockpit(
      input({
        submissionReady: true,
        tasks: [{ title: "להגיש למבטח צד ג'", status: "todo", due_at: "2026-10-20T00:00:00Z" }],
      }),
      NOW,
    );
    expect(nextAction.kind).toBe("prepare_submission");
  });

  test("sent + overdue follow-up → update_handling", () => {
    const { nextAction } = deriveCockpit(
      input({ handlingEffective: "sent", handlingOverdue: true }),
      NOW,
    );
    expect(nextAction.kind).toBe("update_handling");
  });

  test("sent but not overdue → falls through (no handling action)", () => {
    const { nextAction } = deriveCockpit(input({ handlingEffective: "sent" }), NOW);
    expect(nextAction.kind).not.toBe("update_handling");
    expect(nextAction.kind).not.toBe("prepare_submission");
  });

  test("paid → neither handling action", () => {
    const { nextAction } = deriveCockpit(input({ handlingEffective: "paid" }), NOW);
    expect(["prepare_submission", "update_handling"]).not.toContain(nextAction.kind);
  });

  test("a system milestone is never offered as a manual milestone action", () => {
    const { nextAction } = deriveCockpit(
      input({ nextMilestone: { key: "payment_received", label: "התקבל תשלום" } }),
      NOW,
    );
    expect(nextAction.kind).not.toBe("milestone");
  });

  test("an agent milestone still is", () => {
    const { nextAction } = deriveCockpit(
      input({ nextMilestone: { key: "car_at_garage", label: "רכב נכנס למוסך" } }),
      NOW,
    );
    expect(nextAction.kind).toBe("milestone");
  });
});
