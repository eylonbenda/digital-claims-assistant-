import { describe, it, expect } from "vitest";
import { TASK_RULES, DUE_OFFSETS } from "./templates";

describe("TASK_RULES", () => {
  it("has a positive integer due offset for every rule", () => {
    for (const rule of TASK_RULES) {
      expect(rule.dueDays, rule.key).toBeGreaterThan(0);
      expect(Number.isInteger(rule.dueDays), rule.key).toBe(true);
      expect(DUE_OFFSETS[rule.key], rule.key).toBe(rule.dueDays);
    }
  });

  it("has unique keys within each track scope", () => {
    // 'all' rules must not collide with any track-specific rule; track rules
    // must be unique per track (the same key MAY appear on different tracks).
    const allKeys = new Set(
      TASK_RULES.filter((r) => r.track === "all").map((r) => r.key),
    );
    const perTrack = new Map<string, Set<string>>();
    for (const r of TASK_RULES) {
      if (r.track === "all") continue;
      expect(allKeys.has(r.key), r.key).toBe(false);
      const seen = perTrack.get(r.track) ?? new Set();
      expect(seen.has(r.key), `${r.track}/${r.key}`).toBe(false);
      seen.add(r.key);
      perTrack.set(r.track, seen);
    }
  });

  it("only targets valid tracks", () => {
    const valid = new Set([
      "all", "own_policy", "third_party_report", "third_party_settlement",
    ]);
    for (const rule of TASK_RULES) expect(valid.has(rule.track), rule.key).toBe(true);
  });
});
