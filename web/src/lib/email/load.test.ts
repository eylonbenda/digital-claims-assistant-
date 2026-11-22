import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClaimEmails } from "./load";

const ROW = {
  id: "e1", kind: "insurer", direction: "inbound", delivery_failed: false, from_addr: "a@b.co",
  to_addrs: [], subject: "s", text_body: "t", received_at: "2026-11-20T10:00:00Z",
  attachments_dropped: false, claim_email_attachments: [],
};

// Answers the two reads of loadClaimEmails in order: the rows, then the handled state.
function client(handled: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const results = [{ data: [ROW], error: null }, handled];
  const chain = () => {
    const result = results.shift();
    const q: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) };
    q.select = () => q; q.eq = () => q; q.order = () => q;
    return q;
  };
  return { from: chain } as unknown as SupabaseClient;
}

describe("loadClaimEmails — handled state", () => {
  test("overlays what the clerk decided", async () => {
    const rows = await loadClaimEmails(
      client({ data: [{ id: "e1", handled_at: "2026-11-21T08:00:00Z", handled_as: "rejected" }], error: null }), "c1",
    );
    expect(rows?.[0]).toMatchObject({ handled_at: "2026-11-21T08:00:00Z", handled_as: "rejected" });
  });

  test("an unhandled email stays null", async () => {
    const rows = await loadClaimEmails(client({ data: [{ id: "e1", handled_at: null, handled_as: null }], error: null }), "c1");
    expect(rows?.[0]).toMatchObject({ handled_at: null, handled_as: null });
  });

  test("migration 015 missing: the correspondence still loads and nothing is pending", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = await loadClaimEmails(client({ data: null, error: { message: "column does not exist" } }), "c1");
    expect(rows).toHaveLength(1);
    expect(rows?.[0].handled_at).toBe("2026-11-20T10:00:00Z");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
