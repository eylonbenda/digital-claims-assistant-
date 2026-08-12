import { describe, expect, it } from "vitest";
import { deriveCockpit, type CockpitInput } from "./derive";

const NOW = new Date("2026-08-12T10:00:00+03:00");
const base: CockpitInput = {
  classificationNeedsAttention: false,
  classificationUnconfirmed: false,
  blocking: [],
  chaseLabels: [],
  tasks: [],
  missingFieldCount: 0,
  hasGeneratedForm: false,
  nextMilestone: null,
  insurerLabel: "הראל",
  docsCount: 4,
};

describe("deriveCockpit precedence (spec §3, top-down first match)", () => {
  it("1. unconfirmed classification wins over everything", () => {
    const { nextAction } = deriveCockpit({
      ...base,
      classificationUnconfirmed: true,
      blocking: [{ key: "car_photo", label: "תמונות נזק", kind: "doc" }],
      tasks: [{ title: "x", status: "open", due_at: null }],
    }, NOW);
    expect(nextAction.kind).toBe("classify");
    expect(nextAction.targetTab).toBe("overview");
  });

  it("1b. confirmed-but-contestable classification does not block chase", () => {
    const { nextAction, badges } = deriveCockpit({
      ...base,
      classificationUnconfirmed: false,
      classificationNeedsAttention: true,
      blocking: [{ key: "car_photo", label: "תמונות נזק", kind: "doc" }],
      chaseLabels: ["תמונות נזק"],
    }, NOW);
    expect(nextAction.kind).toBe("chase");
    expect(badges.overview).toBe(true);
  });

  it("2. blocking docs → chase, with chaseable labels only in the line", () => {
    const { nextAction } = deriveCockpit({
      ...base,
      blocking: [
        { key: "car_photo", label: "תמונות נזק", kind: "doc" },
        { key: "accident_form", label: "טופס הודעה על תאונה", kind: "form" },
      ],
      chaseLabels: ["תמונות נזק"],
      tasks: [{ title: "x", status: "open", due_at: null }],
    }, NOW);
    expect(nextAction.kind).toBe("chase");
    expect(nextAction.line).toContain("תמונות נזק");
    expect(nextAction.targetTab).toBe("work");
  });

  it("3. tasks: most-overdue open task, done tasks ignored", () => {
    const { nextAction } = deriveCockpit({
      ...base,
      tasks: [
        { title: "ישנה וסגורה", status: "done", due_at: "2026-08-01T00:00:00Z" },
        { title: "באיחור", status: "open", due_at: "2026-08-10T00:00:00Z" },
        { title: "עתידית", status: "open", due_at: "2026-08-20T00:00:00Z" },
      ],
    }, NOW);
    expect(nextAction.kind).toBe("task");
    expect(nextAction.line).toBe("תורך: באיחור · באיחור 2 ימים");
  });

  it("4. missing form fields", () => {
    const { nextAction } = deriveCockpit({ ...base, missingFieldCount: 2 }, NOW);
    expect(nextAction.kind).toBe("form_fields");
    expect(nextAction.targetTab).toBe("form");
  });

  it("5. data complete but no form yet → form_fill", () => {
    const { nextAction } = deriveCockpit(base, NOW);
    expect(nextAction.kind).toBe("form_fill");
  });

  it("5b. form generated → form_ready", () => {
    const { nextAction } = deriveCockpit({ ...base, hasGeneratedForm: true }, NOW);
    expect(nextAction.kind).toBe("form_ready");
    expect(nextAction.line).toContain("הראל");
  });

  it("6. form done + milestone pending → milestone fallback", () => {
    const { nextAction } = deriveCockpit({
      ...base, hasGeneratedForm: true,
      nextMilestone: { key: "submitted_to_insurer", label: "הוגש למבטח" },
    }, NOW);
    expect(nextAction.kind).toBe("milestone");
    if (nextAction.kind === "milestone") expect(nextAction.milestoneKey).toBe("submitted_to_insurer");
  });
});

describe("badges", () => {
  it("work = open tasks + blocking doc items; form = missing fields; files = docs", () => {
    const { badges } = deriveCockpit({
      ...base,
      classificationNeedsAttention: true,
      blocking: [
        { key: "car_photo", label: "תמונות נזק", kind: "doc" },
        { key: "accident_form", label: "טופס", kind: "form" },
      ],
      tasks: [
        { title: "a", status: "open", due_at: null },
        { title: "b", status: "done", due_at: null },
      ],
      missingFieldCount: 2,
      docsCount: 7,
    }, NOW);
    expect(badges).toEqual({ overview: true, work: 2, form: 2, files: 7 });
  });
});
