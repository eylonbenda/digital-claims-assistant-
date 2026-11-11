import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal chainable Supabase fakes. The auth client answers the ownership reads
// (claims / claim_documents — RLS-scoped in prod); the service client records writes.
const state = {
  user: { id: "u1" } as { id: string } | null,
  claim: { id: "c1", status: "submitted" } as { id: string; status: string } | null,
  doc: { id: "d1", type: "drivers_license", storage_path: "c1/drivers_license/1.jpg" } as
    | { id: string; type: string; storage_path: string }
    | null,
  writes: [] as string[],
};

function readChain(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: table === "claims" ? state.claim : state.doc }),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => readChain(t),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => ({
      delete: () => ({ eq: async () => (state.writes.push(`delete ${t}`), { error: null }) }),
      update: (v: { type: string }) => ({
        eq: async () => (state.writes.push(`update ${t} ${v.type}`), { error: null }),
      }),
      insert: async (v: { type: string }) => (state.writes.push(`insert ${t} ${v.type}`), { error: null }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => (state.writes.push(`remove ${paths[0]}`), { error: null }),
      }),
    },
  }),
}));

const runEngine = vi.fn(async () => null);
vi.mock("@/lib/tasks/runner", () => ({ runEngine: (...a: unknown[]) => runEngine(...(a as [])) }));
vi.mock("@/lib/observability/report", () => ({
  reportError: async () => {},
  serverError: async () => Response.json({ error: "server" }, { status: 500 }),
}));

const { DELETE, PATCH } = await import("./route");

const ctx = { params: Promise.resolve({ id: "c1", docId: "d1" }) };
const patch = (body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  state.user = { id: "u1" };
  state.claim = { id: "c1", status: "submitted" };
  state.doc = { id: "d1", type: "drivers_license", storage_path: "c1/drivers_license/1.jpg" };
  state.writes = [];
  runEngine.mockClear();
});

describe("DELETE /api/claims/[id]/documents/[docId]", () => {
  it("deletes the row, then the Storage object, and logs the event", async () => {
    const res = await DELETE(new Request("http://x"), ctx);
    expect(res.status).toBe(200);
    expect(state.writes).toEqual([
      "delete claim_documents",
      "remove c1/drivers_license/1.jpg",
      "insert claim_events document_deleted",
    ]);
  });

  it("401 without a session", async () => {
    state.user = null;
    expect((await DELETE(new Request("http://x"), ctx)).status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it("404 for a document the agent can't see (another agent's claim)", async () => {
    state.doc = null;
    expect((await DELETE(new Request("http://x"), ctx)).status).toBe(404);
    expect(state.writes).toEqual([]);
  });

  it("409 on a closed claim", async () => {
    state.claim = { id: "c1", status: "closed" };
    expect((await DELETE(new Request("http://x"), ctx)).status).toBe(409);
    expect(state.writes).toEqual([]);
  });
});

describe("PATCH /api/claims/[id]/documents/[docId]", () => {
  it("re-files the document and lets the engine react to the new type", async () => {
    const res = await patch({ type: "vehicle_reg" });
    expect(res.status).toBe(200);
    expect(state.writes).toEqual([
      "update claim_documents vehicle_reg",
      "insert claim_events document_retyped",
    ]);
    expect(runEngine).toHaveBeenCalledWith("c1", { type: "doc_uploaded", docType: "vehicle_reg" });
  });

  it("400 on a type outside the agent list", async () => {
    expect((await patch({ type: "nope" })).status).toBe(400);
    expect(state.writes).toEqual([]);
  });

  it("no-op when the type is unchanged", async () => {
    expect((await patch({ type: "drivers_license" })).status).toBe(200);
    expect(state.writes).toEqual([]);
  });
});
