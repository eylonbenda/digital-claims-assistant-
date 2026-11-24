import { beforeEach, describe, expect, it, vi } from "vitest";

// A query builder that answers every chained call with itself and resolves to `result`.
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "update"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q as Record<string, ReturnType<typeof vi.fn>>;
}

let user: { id: string } | null;
let visible: Record<string, unknown>; // what the user's client sees, per table
let written: ReturnType<typeof query>;
let writeResult: { error: unknown; count: number | null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => query({ data: visible[table] ?? null }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      written = query(writeResult);
      return written;
    },
  }),
}));
vi.mock("@/lib/observability/report", () => ({
  serverError: async () => Response.json({ error: "server" }, { status: 500 }),
}));

async function post(body: unknown = { claim_id: "c1" }) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/emails/e1/assign", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "e1" }) },
  );
}

describe("POST /api/emails/[id]/assign", () => {
  beforeEach(() => {
    user = { id: "u1" };
    visible = { claim_emails: { id: "e1", claim_id: null }, claims: { id: "c1" } };
    writeResult = { error: null, count: 1 };
    written = query(null);
  });

  it("refuses an unauthenticated request", async () => {
    user = null;
    expect((await post()).status).toBe(401);
  });

  it("needs a claim id", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("answers 404 for a message the user cannot see", async () => {
    visible.claim_emails = null;
    expect((await post()).status).toBe(404);
    expect(written.update).not.toHaveBeenCalled();
  });

  it("answers 404 for a claim the user cannot see, and writes nothing", async () => {
    visible.claims = null;
    expect((await post()).status).toBe(404);
    expect(written.update).not.toHaveBeenCalled();
  });

  it("answers 409 for a message that is already on a claim", async () => {
    visible.claim_emails = { id: "e1", claim_id: "other" };
    expect((await post()).status).toBe(409);
  });

  it("files the message on the claim as a manual match", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(written.update.mock.calls[0][0]).toEqual({ claim_id: "c1", match_method: "manual" });
    expect(written.eq).toHaveBeenCalledWith("id", "e1");
    expect(written.is).toHaveBeenCalledWith("claim_id", null);
  });

  it("answers 409 when another request filed it first", async () => {
    writeResult = { error: null, count: 0 };
    expect((await post()).status).toBe(409);
  });
});

async function del() {
  const { DELETE } = await import("./route");
  return DELETE(new Request("http://localhost/api/emails/e1/assign", { method: "DELETE" }), {
    params: Promise.resolve({ id: "e1" }),
  });
}

describe("DELETE /api/emails/[id]/assign", () => {
  beforeEach(() => {
    user = { id: "u1" };
    visible = { claim_emails: { id: "e1", claim_id: "c1", direction: "inbound", handled_as: null } };
    writeResult = { error: null, count: 1 };
    written = query(null);
  });

  it("refuses an unauthenticated request", async () => {
    user = null;
    expect((await del()).status).toBe(401);
  });

  it("answers 404 for a message the user cannot see", async () => {
    visible.claim_emails = null;
    expect((await del()).status).toBe(404);
    expect(written.update).not.toHaveBeenCalled();
  });

  it("answers 404 for a message we sent — it belongs to its claim", async () => {
    visible.claim_emails = { id: "e1", claim_id: "c1", direction: "outbound", handled_as: null };
    expect((await del()).status).toBe(404);
    expect(written.update).not.toHaveBeenCalled();
  });

  it("answers 409 for a message that is on no claim", async () => {
    visible.claim_emails = { id: "e1", claim_id: null, direction: "inbound", handled_as: null };
    expect((await del()).status).toBe(409);
  });

  it("refuses a message the claim's status was set from", async () => {
    visible.claim_emails = { id: "e1", claim_id: "c1", direction: "inbound", handled_as: "in_review" };
    expect((await del()).status).toBe(409);
    expect(written.update).not.toHaveBeenCalled();
  });

  it("returns the message to the inbox, undecided", async () => {
    visible.claim_emails = { id: "e1", claim_id: "c1", direction: "inbound", handled_as: "none" };
    const res = await del();
    expect(res.status).toBe(200);
    expect(written.update.mock.calls[0][0]).toEqual({
      claim_id: null, match_method: null, handled_at: null, handled_as: null,
    });
    expect(written.eq).toHaveBeenCalledWith("id", "e1");
    // Compare-and-set on the claim it was read on.
    expect(written.eq).toHaveBeenCalledWith("claim_id", "c1");
  });

  it("answers 409 when the message moved in the meantime", async () => {
    writeResult = { error: null, count: 0 };
    expect((await del()).status).toBe(409);
  });
});
