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
