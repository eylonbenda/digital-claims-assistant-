import { describe, expect, it } from "vitest";
import { canRemind, reminderTarget } from "./reminder";
import type { SendItem } from "@/lib/outbound/queue";

const item = {
  claim_id: "c1", task_id: "t1", task_key: "finish_wizard", body: "item body", href: "https://wa.me/item",
} as SendItem;

describe("reminderTarget", () => {
  it("uses the pending queue item", () => {
    const t = reminderTarget("c1", item, "https://wa.me/fb", "fb body");
    expect(t.href).toBe("https://wa.me/item");
    expect(t.payload).toEqual({ claim_id: "c1", task_id: "t1", task_key: "finish_wizard", kind: "sent", body: "item body" });
  });
  it("falls back to the ad-hoc chase", () => {
    const t = reminderTarget("c1", null, "https://wa.me/fb", "fb body");
    expect(t.href).toBe("https://wa.me/fb");
    expect(t.payload).toEqual({ claim_id: "c1", task_key: "chase_missing_docs", kind: "sent", body: "fb body" });
  });
  it("null href passes through", () => {
    expect(reminderTarget("c1", null, null, "b").href).toBeNull();
  });
});

describe("canRemind", () => {
  it("true with a pending item and no labels", () => expect(canRemind(item, [])).toBe(true));
  it("true with labels and no pending item", () => expect(canRemind(null, ["x"])).toBe(true));
  it("false with neither", () => expect(canRemind(null, [])).toBe(false));
});
