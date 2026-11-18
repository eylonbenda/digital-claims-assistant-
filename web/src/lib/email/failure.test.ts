import { describe, expect, it } from "vitest";
import { BOUNCE_TASK_TITLE, recordDeliveryFailure, type FailureStore } from "./failure";

// One outbound message per provider id; flagged once, like the compare-and-set in the database.
function fakeStore(rows: Record<string, { claimId: string | null; failed: boolean }>) {
  const tasks: { claimId: string; title: string }[] = [];
  const store: FailureStore = {
    markDeliveryFailed: async (id) => {
      const row = rows[id];
      if (!row || row.failed) return null;
      row.failed = true;
      return { claimId: row.claimId };
    },
    addTask: async (claimId, title) => { tasks.push({ claimId, title }); },
  };
  return { store, tasks, rows };
}

describe("recordDeliveryFailure", () => {
  it("flags the message and gives its claim one task", async () => {
    const f = fakeStore({ "prov-1": { claimId: "c1", failed: false } });
    expect(await recordDeliveryFailure("prov-1", f.store)).toBe("recorded");
    expect(f.rows["prov-1"].failed).toBe(true);
    expect(f.tasks).toEqual([{ claimId: "c1", title: BOUNCE_TASK_TITLE }]);
  });

  it("does nothing the second time the same event arrives", async () => {
    const f = fakeStore({ "prov-1": { claimId: "c1", failed: false } });
    await recordDeliveryFailure("prov-1", f.store);
    expect(await recordDeliveryFailure("prov-1", f.store)).toBe("ignored");
    expect(f.tasks).toHaveLength(1);
  });

  it("ignores a message it never sent — e.g. a bounced copy to the business", async () => {
    const f = fakeStore({});
    expect(await recordDeliveryFailure("prov-unknown", f.store)).toBe("ignored");
    expect(f.tasks).toEqual([]);
  });

  it("flags a message whose claim was since deleted, without a task", async () => {
    const f = fakeStore({ "prov-1": { claimId: null, failed: false } });
    expect(await recordDeliveryFailure("prov-1", f.store)).toBe("recorded");
    expect(f.tasks).toEqual([]);
  });
});
