import { describe, it, expect } from "vitest";
import { buildFactSheet, type BriefClaimRow } from "./facts";

const NOW = new Date("2026-07-23T10:00:00Z");
const FLAGS = { theft: false, lien: false, business_use: false, policy_activated: false, garage_network_rider: false };

function claim(over: Partial<BriefClaimRow> = {}): BriefClaimRow {
  return {
    id: "c1", client_name: "דנה לוי", client_phone: "0521234567", access_token: "tok",
    claim_type: "third_party_report", status: "classified", urgent: false,
    created_at: "2026-07-13T08:00:00Z", submitted_at: "2026-07-14T08:00:00Z",
    checklist_state: {}, analysis_summary: null, flags: FLAGS, ...over,
  };
}

describe("buildFactSheet", () => {
  it("carries identity + action fields and computes a positive score for a needy claim", () => {
    const s = buildFactSheet(
      { claim: claim(), openTasks: [{ title: "מעקב", due_at: "2026-07-20T00:00:00Z" }],
        docTypes: new Set(), hasForm: false, lastActivityAt: "2026-07-14T08:00:00Z" },
      NOW,
    );
    expect(s.claim_id).toBe("c1");
    expect(s.access_token).toBe("tok");
    expect(s.score).toBeGreaterThan(0);
    expect(s.blocking_labels.length).toBeGreaterThan(0); // TP-report with no docs → blockers
  });

  it("describes overdue tasks and staleness in Hebrew facts", () => {
    const s = buildFactSheet(
      { claim: claim(), openTasks: [{ title: "מעקב", due_at: "2026-07-20T00:00:00Z" }],
        docTypes: new Set(), hasForm: false, lastActivityAt: "2026-07-14T08:00:00Z" },
      NOW,
    );
    expect(s.facts.join(" ")).toContain("באיחור");
    expect(s.facts.join(" ")).toContain("ללא פעילות");
  });

  it("marks the next task overdue and picks the earliest due", () => {
    const s = buildFactSheet(
      { claim: claim(), openTasks: [
          { title: "ב", due_at: "2026-07-25T00:00:00Z" },
          { title: "א", due_at: "2026-07-20T00:00:00Z" },
        ],
        docTypes: new Set(), hasForm: false, lastActivityAt: null },
      NOW,
    );
    expect(s.next_task?.title).toBe("א");
    expect(s.next_task?.overdue).toBe(true);
  });

  it("includes the cached analysis one-liner when present", () => {
    const s = buildFactSheet(
      { claim: claim({ analysis_summary: "תאונה בצומת, צד ג' אשם" }), openTasks: [],
        docTypes: new Set(), hasForm: false, lastActivityAt: null },
      NOW,
    );
    expect(s.facts).toContain("תאונה בצומת, צד ג' אשם");
  });

  it("flags an unclassified submitted claim", () => {
    const s = buildFactSheet(
      { claim: claim({ claim_type: "unknown" }), openTasks: [],
        docTypes: new Set(), hasForm: false, lastActivityAt: null },
      NOW,
    );
    expect(s.facts.join(" ")).toContain("ממתין לסיווג");
  });
});
