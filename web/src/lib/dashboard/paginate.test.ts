import { describe, expect, it } from "vitest";
import { paginate, parsePage } from "./paginate";

const items = Array.from({ length: 83 }, (_, i) => i + 1);

describe("paginate", () => {
  it("first page", () => {
    const p = paginate(items, 1, 20);
    expect(p.items).toEqual(items.slice(0, 20));
    expect(p).toMatchObject({ page: 1, pages: 5, from: 1, to: 20, total: 83 });
  });
  it("partial last page", () => {
    const p = paginate(items, 5, 20);
    expect(p.items).toEqual([81, 82, 83]);
    expect(p).toMatchObject({ page: 5, from: 81, to: 83 });
  });
  // The list can shrink under the operator (a send/close + router.refresh, or a
  // search) — a stale page number must land on the last real page, not an empty one.
  it("clamps a page past the end to the last page", () =>
    expect(paginate(items, 9, 20)).toMatchObject({ page: 5, from: 81, to: 83 }));
  it("clamps below 1", () => expect(paginate(items, 0, 20).page).toBe(1));
  it("empty list is one empty page", () =>
    expect(paginate([], 3, 20)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 }));
  it("exact multiple has no trailing empty page", () =>
    expect(paginate(items.slice(0, 40), 2, 20)).toMatchObject({ page: 2, pages: 2, from: 21, to: 40 }));
});

describe("parsePage", () => {
  it("reads a positive int", () => expect(parsePage("3")).toBe(1 + 2));
  it.each([undefined, "", "0", "-2", "abc", "2.5"])("falls back to 1 for %s", (raw) =>
    expect(parsePage(raw)).toBe(1));
  it("takes the first of a repeated param", () => expect(parsePage(["4", "7"])).toBe(4));
});
