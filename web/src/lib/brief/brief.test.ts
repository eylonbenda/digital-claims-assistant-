import { describe, it, expect } from "vitest";
import { assembleBrief, briefDate } from "./brief";
import type { FactSheet } from "./facts";

const NOW = new Date("2026-07-23T05:30:00Z");

function sheet(over: Partial<FactSheet>): FactSheet {
  return {
    claim_id: "x", client_name: null, client_phone: null, access_token: "t",
    status: "classified", claim_type: "own_policy",
    score: 0, facts: ["עובדה"], blocking_labels: [], next_task: null, ...over,
  };
}

describe("briefDate", () => {
  it("is the UTC calendar day", () => {
    expect(briefDate(NOW)).toBe("2026-07-23");
  });
});

describe("assembleBrief", () => {
  it("orders by tier, then score desc within tier", () => {
    const sheets = [
      sheet({ claim_id: "low", score: 5 }),
      sheet({ claim_id: "hot", score: 80 }),
      sheet({ claim_id: "mid", score: 70 }),
    ];
    const brief = assembleBrief(sheets, [
      { claim_id: "low", tier: "ok", reason: "שקט", flags: [] },
      { claim_id: "hot", tier: "act_now", reason: "בוער", flags: [] },
      { claim_id: "mid", tier: "act_now", reason: "חשוב", flags: [] },
    ], NOW);
    expect(brief.ai).toBe(true);
    expect(brief.items.map((i) => i.claim_id)).toEqual(["hot", "mid", "low"]);
  });

  it("fills AI-omitted claims from score thresholds, marked ai:false", () => {
    const brief = assembleBrief([sheet({ claim_id: "a", score: 100 })], [], NOW);
    expect(brief.ai).toBe(true);            // the call succeeded; one item fell back
    expect(brief.items[0].tier).toBe("act_now");
    expect(brief.items[0].ai).toBe(false);
    expect(brief.items[0].reason).toBe("עובדה");
  });

  it("degrades fully when signals are null (AI unavailable)", () => {
    const brief = assembleBrief([sheet({ claim_id: "a", score: 30 })], null, NOW);
    expect(brief.ai).toBe(false);
    expect(brief.items[0].tier).toBe("this_week");
    expect(brief.items[0].ai).toBe(false);
  });
});
