import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable Supabase fakes: the auth client answers the RLS-scoped ownership read,
// the service client records every write so tests can assert nothing leaked.
const initial = () => ({
  user: { id: "u1" } as { id: string } | null,
  claim: { id: "c1", no_repair: false } as { id: string; no_repair: boolean } | null,
  updates: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  engineCalls: [] as unknown[],
});
let state = initial();

function chain<T>(result: () => T) {
  const c = {
    select: () => c,
    eq: () => c,
    single: async () => result(),
    then: (resolve: (v: T) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => chain(() => ({ data: state.claim })),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => ({
      update: (row: Record<string, unknown>) => {
        state.updates.push(row);
        return chain(() => ({ error: null }));
      },
      insert: async (row: Record<string, unknown>) => {
        if (t === "claim_events") state.events.push(row);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/tasks/runner", () => ({
  runEngine: async (_id: string, event: unknown) => {
    state.engineCalls.push(event);
    return { status: "checklist_active" };
  },
}));

vi.mock("@/lib/observability/report", () => ({
  reportError: async () => {},
  serverError: () => Response.json({ error: "server" }, { status: 500 }),
}));

import { PATCH } from "./route";

const call = (body: unknown) =>
  PATCH(
    new Request("http://x/api/claims/c1/flags", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "c1" }) },
  );

beforeEach(() => {
  state = initial();
});

describe("PATCH /api/claims/[id]/flags", () => {
  it("401 without a user", async () => {
    state.user = null;
    expect((await call({ no_repair: true })).status).toBe(401);
    expect(state.updates).toEqual([]);
  });

  it.each([
    [{}],
    [{ no_repair: "yes" }],
    [{ theft: true }],
    [{ no_repair: true, theft: true }],
  ])("400 and no write for %j", async (body) => {
    expect((await call(body)).status).toBe(400);
    expect(state.updates).toEqual([]);
    expect(state.engineCalls).toEqual([]);
  });

  it("404 when the claim is not the caller's (RLS select returns null)", async () => {
    state.claim = null;
    expect((await call({ no_repair: true })).status).toBe(404);
    expect(state.updates).toEqual([]);
  });

  it("writes the flag, records one event and re-runs the engine", async () => {
    const res = await call({ no_repair: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, no_repair: true });
    expect(state.updates).toEqual([{ no_repair: true }]);
    expect(state.events).toEqual([
      { claim_id: "c1", type: "flags_changed", payload_json: { no_repair: true } },
    ]);
    expect(state.engineCalls).toEqual([{ type: "flags_changed" }]);
  });

  it("records no event when the value is unchanged", async () => {
    state.claim = { id: "c1", no_repair: true };
    expect((await call({ no_repair: true })).status).toBe(200);
    expect(state.events).toEqual([]);
  });
});
