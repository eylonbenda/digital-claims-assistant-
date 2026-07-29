import { describe, it, expect } from "vitest";
import { toILDate } from "./dates";

describe("toILDate", () => {
  it("converts ISO yyyy-mm-dd to dd/mm/yyyy", () => {
    expect(toILDate("2026-07-10")).toBe("10/07/2026");
    expect(toILDate("1990-01-01")).toBe("01/01/1990");
  });

  it("is idempotent — already-Israeli dates pass through", () => {
    expect(toILDate("10/07/2026")).toBe("10/07/2026");
    expect(toILDate(toILDate("2026-07-10"))).toBe("10/07/2026");
  });

  it("passes through empty and non-date values untouched", () => {
    expect(toILDate("")).toBe("");
    expect(toILDate("לא ידוע")).toBe("לא ידוע");
    expect(toILDate("2026-07")).toBe("2026-07");
    expect(toILDate("2026-7-10")).toBe("2026-7-10");
  });

  it("tolerates an ISO datetime by taking the date part", () => {
    expect(toILDate("2026-07-10T08:30:00Z")).toBe("10/07/2026");
  });
});
