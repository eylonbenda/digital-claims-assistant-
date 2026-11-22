import { describe, expect, it } from "vitest";
import { runPool } from "./pool";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("runPool", () => {
  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      peak = Math.max(peak, ++running);
      await tick(5);
      running--;
    });
    expect(peak).toBe(3);
  });

  it("keeps results in input order", async () => {
    const out = await runPool([30, 5, 15], 3, async (ms) => {
      await tick(ms);
      return ms;
    });
    expect(out.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([30, 5, 15]);
  });

  it("reports a failed item at its index and still finishes the rest", async () => {
    const out = await runPool(["a", "b", "c"], 2, async (v) => {
      if (v === "b") throw new Error("boom");
      return v;
    });
    expect(out.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("handles an empty list", async () => {
    expect(await runPool([], 3, async () => 1)).toEqual([]);
  });
});
