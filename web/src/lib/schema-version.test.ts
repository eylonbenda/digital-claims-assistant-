import { describe, expect, it } from "vitest";
import { compareSchema, isMissingTableError, parseVersionList } from "./schema-version";

const EXPECTED = ["001", "002", "003", "010"];

describe("parseVersionList", () => {
  it("splits, trims, dedupes and sorts numerically", () => {
    expect(parseVersionList(" 010,002, 001,002,,")).toEqual(["001", "002", "010"]);
  });
  it("is empty for undefined / empty", () => {
    expect(parseVersionList(undefined)).toEqual([]);
    expect(parseVersionList("")).toEqual([]);
  });
});

describe("compareSchema", () => {
  it("ok when the DB has exactly the expected versions", () => {
    expect(compareSchema(EXPECTED, ["001", "002", "003", "010"])).toEqual({
      ok: true,
      status: "ok",
      expected: "010",
      actual: "010",
      missing: [],
    });
  });

  it("ok when the DB is ahead of the code (migration pasted before merge)", () => {
    const r = compareSchema(EXPECTED, ["001", "002", "003", "010", "011"]);
    expect(r.ok).toBe(true);
    expect(r.actual).toBe("011");
  });

  it("behind when the newest migration was never applied (the 007 incident)", () => {
    const r = compareSchema(EXPECTED, ["001", "002", "003"]);
    expect(r).toMatchObject({ ok: false, status: "behind", expected: "010", actual: "003", missing: ["010"] });
  });

  it("behind on a gap below the max even though actual >= expected", () => {
    const r = compareSchema(EXPECTED, ["001", "003", "010"]);
    expect(r).toMatchObject({ ok: false, status: "behind", missing: ["002"] });
  });

  it("missing_table when schema_migrations does not exist", () => {
    expect(compareSchema(EXPECTED, null)).toMatchObject({
      ok: false,
      status: "missing_table",
      expected: "010",
      actual: null,
      missing: [],
    });
  });

  it("an empty table is behind", () => {
    expect(compareSchema(EXPECTED, [])).toMatchObject({ ok: false, status: "behind", actual: null });
  });

  it("compares numerically, not by string padding", () => {
    expect(compareSchema(["010"], ["10"]).ok).toBe(true);
  });
});

describe("isMissingTableError", () => {
  it("recognises PostgREST and Postgres codes", () => {
    expect(isMissingTableError({ code: "PGRST205" })).toBe(true);
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
    expect(isMissingTableError({ code: "PGRST301" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
