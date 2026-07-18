import { describe, expect, it } from "vitest";
import { buildDigest, type DigestClaimRow, type DigestTaskRow } from "./digest";

const NOW = new Date("2026-07-18T10:00:00Z");
const ORIGIN = "https://app.example";

const claim = (over: Partial<DigestClaimRow> = {}): DigestClaimRow => ({
  id: "c1", client_name: "ישראל ישראלי", client_phone: "0521234567",
  access_token: "tok1", ...over,
});
const task = (over: Partial<DigestTaskRow> = {}): DigestTaskRow => ({
  id: "t1", claim_id: "c1", key: "follow_up_insurer", title: "מעקב תשובת מבטח",
  status: "todo", due_at: "2026-07-15T00:00:00Z", ...over,
});

describe("buildDigest", () => {
  it("includes overdue and due-today tasks, excludes future ones", () => {
    const groups = buildDigest(
      [
        task({ id: "t1", due_at: "2026-07-15T00:00:00Z" }), // overdue
        task({ id: "t2", due_at: "2026-07-18T23:00:00Z" }), // due today
        task({ id: "t3", due_at: "2026-07-25T00:00:00Z" }), // future
      ],
      [claim()], NOW, ORIGIN
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.task.id)).toEqual(["t1", "t2"]);
  });

  it("excludes done tasks and tasks without a due date", () => {
    const groups = buildDigest(
      [task({ status: "done" }), task({ id: "t2", due_at: null })],
      [claim()], NOW, ORIGIN
    );
    expect(groups).toHaveLength(0);
  });

  it("computes daysOverdue (0 = due today)", () => {
    const groups = buildDigest(
      [task({ due_at: "2026-07-15T00:00:00Z" }), task({ id: "t2", due_at: "2026-07-18T20:00:00Z" })],
      [claim()], NOW, ORIGIN
    );
    expect(groups[0].entries[0].daysOverdue).toBe(3);
    expect(groups[0].entries[1].daysOverdue).toBe(0);
  });

  it("orders groups by most-overdue first", () => {
    const groups = buildDigest(
      [
        task({ id: "t1", claim_id: "c1", due_at: "2026-07-17T00:00:00Z" }),
        task({ id: "t2", claim_id: "c2", due_at: "2026-07-10T00:00:00Z" }),
      ],
      [claim({ id: "c1" }), claim({ id: "c2", access_token: "tok2" })],
      NOW, ORIGIN
    );
    expect(groups.map((g) => g.claim.id)).toEqual(["c2", "c1"]);
  });

  it("builds a wa.me chase link only for chase_missing_docs with a valid phone", () => {
    const groups = buildDigest(
      [
        task({ id: "t1", key: "chase_missing_docs", title: "להשלים מסמכים חסרים מהלקוח" }),
        task({ id: "t2", key: "follow_up_insurer" }),
      ],
      [claim()], NOW, ORIGIN
    );
    const [chase, other] = groups[0].entries.map((e) => e.waHref);
    expect(chase).toContain("wa.me/972521234567");
    expect(chase).toContain(encodeURIComponent(`${ORIGIN}/c/tok1`));
    expect(other).toBeNull();
  });

  it("omits the wa link when the phone is unparseable", () => {
    const groups = buildDigest(
      [task({ key: "chase_missing_docs" })],
      [claim({ client_phone: null })], NOW, ORIGIN
    );
    expect(groups[0].entries[0].waHref).toBeNull();
  });
});
