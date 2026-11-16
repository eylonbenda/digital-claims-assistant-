import { describe, expect, it } from "vitest";
import { staleDemandRows } from "./cleanup";

const row = (id: string, created_at: string) => ({ id, created_at });

describe("staleDemandRows", () => {
  it("returns every row but the newest", () => {
    const rows = [
      row("a", "2026-01-01T00:00:00Z"),
      row("b", "2026-01-03T00:00:00Z"),
      row("c", "2026-01-02T00:00:00Z"),
    ];
    expect(staleDemandRows(rows).map((r) => r.id).sort()).toEqual(["a", "c"]);
  });

  it("returns [] for one row or none", () => {
    expect(staleDemandRows([row("a", "2026-01-01T00:00:00Z")])).toEqual([]);
    expect(staleDemandRows([])).toEqual([]);
  });

  it("keeps the larger id when created_at ties", () => {
    const rows = [row("a", "2026-01-01T00:00:00Z"), row("b", "2026-01-01T00:00:00Z")];
    expect(staleDemandRows(rows).map((r) => r.id)).toEqual(["a"]);
    expect(staleDemandRows([...rows].reverse()).map((r) => r.id)).toEqual(["a"]);
  });

  it("does not mutate its input", () => {
    const rows = [row("b", "2026-01-02T00:00:00Z"), row("a", "2026-01-01T00:00:00Z")];
    staleDemandRows(rows);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
