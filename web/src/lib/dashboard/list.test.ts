import { describe, expect, it } from "vitest";
import type { ClaimRow } from "./compose";
import { chipCounts, matchesQuery, normalizeDigits, parseStageFilter, visibleRows } from "./list";

function row(over: Partial<ClaimRow> = {}): ClaimRow {
  return {
    claim_id: "c1", client_name: "דנה כהן", track_label: "דוח פרטי",
    action_line: "", ai_line: null, also_line: null, send: null,
    overdue_days: 0, created_at: "2026-10-01T00:00:00Z", activity_at: "2026-10-01T00:00:00Z",
    fresh: null, needs_action: false,
    stage: "before_send", phone: "0521234567", urgent: false, closed: false,
    access_token: "tok", client_plate: null, tp_plates: [],
    ...over,
  };
}

describe("normalizeDigits", () => {
  it("keeps digits only", () => {
    expect(normalizeDigits("12-345-67")).toBe("1234567");
    expect(normalizeDigits(null)).toBe("");
    expect(normalizeDigits(undefined)).toBe("");
  });
});

describe("matchesQuery", () => {
  it("empty or whitespace query matches everything", () => {
    expect(matchesQuery(row(), "")).toBe(true);
    expect(matchesQuery(row(), "   ")).toBe(true);
  });
  it("plate query matches across formats", () => {
    const r = row({ client_plate: "12-345-67" });
    expect(matchesQuery(r, "1234567")).toBe(true);
    expect(matchesQuery(r, "12 345 67")).toBe(true);
  });
  it("matches a second third-party vehicle's plate", () => {
    expect(matchesQuery(row({ tp_plates: ["11-111-11", "22-333-44"] }), "2233344")).toBe(true);
  });
  it("phone digits match with dashes in the query", () => {
    expect(matchesQuery(row({ phone: "0521234567" }), "052-123")).toBe(true);
  });
  it("fewer than 3 digits never digit-matches", () => {
    expect(matchesQuery(row({ phone: "0555555555", client_name: "דנה" }), "5")).toBe(false);
  });
  it("name substring matches; null name doesn't throw", () => {
    expect(matchesQuery(row({ client_name: "דנה כהן" }), "כהן")).toBe(true);
    expect(matchesQuery(row({ client_name: null, phone: null }), "כהן")).toBe(false);
  });
});

describe("visibleRows", () => {
  it("'all' hides closed rows unless the query matches them", () => {
    const rows = [
      row({ claim_id: "a", client_name: "אבי" }),
      row({ claim_id: "b", client_name: "בני", closed: true, stage: "closed" }),
    ];
    expect(visibleRows(rows, "all", "").map((r) => r.claim_id)).toEqual(["a"]);
    expect(visibleRows(rows, "all", "בני").map((r) => r.claim_id)).toEqual(["b"]);
  });
  it("needs_you excludes closed and sorts most-overdue first", () => {
    const rows = [
      row({ claim_id: "a", needs_action: true, overdue_days: 1, activity_at: "2026-10-05T00:00:00Z" }),
      row({ claim_id: "b", needs_action: true, overdue_days: 4, activity_at: "2026-10-02T00:00:00Z" }),
      row({ claim_id: "c", needs_action: true, overdue_days: 1, activity_at: "2026-10-09T00:00:00Z" }),
      row({ claim_id: "d", needs_action: true, closed: true, stage: "closed" }),
      row({ claim_id: "e", needs_action: false }),
    ];
    expect(visibleRows(rows, "needs_you", "").map((r) => r.claim_id)).toEqual(["b", "c", "a"]);
  });
  it("stage filter returns only that stage, newest activity first", () => {
    const rows = [
      row({ claim_id: "a", stage: "sent", activity_at: "2026-10-01T00:00:00Z" }),
      row({ claim_id: "b", stage: "sent", activity_at: "2026-10-03T00:00:00Z" }),
      row({ claim_id: "c", stage: "with_client" }),
    ];
    expect(visibleRows(rows, "sent", "").map((r) => r.claim_id)).toEqual(["b", "a"]);
  });
});

describe("chipCounts", () => {
  it("follow the query", () => {
    const rows = [
      row({ claim_id: "a", client_name: "אבי", stage: "sent" }),
      row({ claim_id: "b", client_name: "בני", stage: "with_client" }),
    ];
    const c = chipCounts(rows, "אבי");
    expect(c.sent).toBe(1);
    expect(c.with_client).toBe(0);
    expect(c.all).toBe(1);
    expect(c.needs_you).toBe(0);
    expect("closed" in c).toBe(false);
  });
});

describe("parseStageFilter", () => {
  it.each([undefined, "xyz", ["sent", "x"], ""])("parseStageFilter(%j) → 'all'", (raw) => {
    expect(parseStageFilter(raw as string | string[] | undefined)).toBe("all");
  });
  it("accepts every valid key", () => {
    for (const k of ["all", "needs_you", "with_client", "before_send", "sent", "awaiting_payment", "closed"]) {
      expect(parseStageFilter(k)).toBe(k);
    }
  });
});
