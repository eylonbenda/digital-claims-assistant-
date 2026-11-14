import { describe, it, expect } from "vitest";
import { setPath } from "./set-path";

describe("setPath", () => {
  it("sets nested strings without mutating the input", () => {
    const a = { x: { y: "1" } };
    const b = setPath(a, "x.z", "2");
    expect(b).toEqual({ x: { y: "1", z: "2" } });
    expect(a).toEqual({ x: { y: "1" } });
  });
  it("creates arrays for numeric keys", () => {
    expect(setPath({}, "tp.0.id", "5")).toEqual({ tp: [{ id: "5" }] });
  });
  it("removes the key for empty string and undefined", () => {
    expect(setPath({ a: { b: "1" } }, "a.b", "")).toEqual({ a: {} });
    expect(setPath({ a: { b: true } }, "a.b", undefined)).toEqual({ a: {} });
  });
  it("stores booleans, including false", () => {
    expect(setPath({}, "a.police.notified", false)).toEqual({ a: { police: { notified: false } } });
    expect(setPath({}, "n", true)).toEqual({ n: true });
  });
});
