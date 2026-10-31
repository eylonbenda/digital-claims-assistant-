import { describe, expect, it } from "vitest";
import { withSearchParam } from "./url-state";

describe("withSearchParam", () => {
  it("sets a param and returns a relative path+search", () => {
    expect(withSearchParam("https://x.test/dashboard", "stage", "with_client")).toBe("/dashboard?stage=with_client");
  });

  it("replaces an existing value and keeps other params", () => {
    expect(withSearchParam("https://x.test/dashboard?stage=sent&p=3", "stage", "closed")).toBe(
      "/dashboard?stage=closed&p=3",
    );
  });

  it("removes the param on null, dropping the '?' when nothing is left", () => {
    expect(withSearchParam("https://x.test/dashboard?p=2", "p", null)).toBe("/dashboard");
    expect(withSearchParam("https://x.test/dashboard?stage=sent&p=2", "p", null)).toBe("/dashboard?stage=sent");
  });

  it("keeps the hash", () => {
    expect(withSearchParam("https://x.test/dashboard#claims-list", "p", "2")).toBe("/dashboard?p=2#claims-list");
  });
});
