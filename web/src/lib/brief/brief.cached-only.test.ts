import { describe, it, expect, vi, beforeEach } from "vitest";

// The contract this file guards: on a render path the brief must never wait on the
// model. Awaiting it there is what made the first dashboard load of each day take
// ~35s, and it's the kind of thing a later refactor can quietly reintroduce — the
// code still "works", it just blocks. So assert the call itself is not made.

const rankClaims = vi.fn();
vi.mock("./rank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rank")>();
  return { ...actual, rankClaims: (...args: unknown[]) => rankClaims(...args) };
});

type Res = { data: unknown; error: unknown };

// Minimal chainable postgrest stub: every builder method returns the chain, and
// awaiting it (or calling maybeSingle) yields the per-table result.
function makeChain(res: Res) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled: (r: Res) => unknown) => Promise.resolve(res).then(onFulfilled);
        }
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(res);
        return () => proxy;
      },
    },
  );
  return proxy;
}

let tables: Record<string, Res>;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => makeChain(tables[t] ?? { data: [], error: null }),
  }),
}));

const { getOrCreateBrief } = await import("./brief");

const CLAIM = {
  id: "c1", client_name: "דוד כהן", client_phone: "0500000000", access_token: "tok",
  claim_type: "own_policy", status: "classified", urgent: false,
  created_at: "2026-07-01T00:00:00Z", submitted_at: "2026-07-02T00:00:00Z",
  checklist_state: {}, summary_json: null,
  theft: false, lien: false, business_use: false,
  policy_activated: false, garage_network_rider: false,
};

beforeEach(() => {
  rankClaims.mockReset();
  rankClaims.mockResolvedValue([
    { claim_id: "c1", tier: "act_now", reason: "מהמודל", flags: [] },
  ]);
  tables = {
    claims: { data: [CLAIM], error: null },
    tasks: { data: [], error: null },
    claim_documents: { data: [], error: null },
    generated_forms: { data: [], error: null },
    claim_notes: { data: [], error: null },
    agent_briefs: { data: null, error: null }, // cold cache
  };
});

describe("getOrCreateBrief({ cachedOnly: true })", () => {
  it("never calls the model on a cold cache, and returns the rules-only brief", async () => {
    const brief = await getOrCreateBrief("agent-1", { cachedOnly: true });

    expect(rankClaims).not.toHaveBeenCalled();
    expect(brief?.ai).toBe(false);
    expect(brief?.items).toHaveLength(1);
    // Reason falls back to the first structured fact rather than an AI sentence.
    expect(brief?.items[0].reason).not.toBe("מהמודל");
  });

  it("still serves today's cached ranking when one exists", async () => {
    tables.agent_briefs = {
      data: {
        payload_json: {
          generated_at: "2026-07-23T04:00:00Z",
          signals: [{ claim_id: "c1", tier: "act_now", reason: "מהמטמון", flags: [] }],
        },
      },
      error: null,
    };

    const brief = await getOrCreateBrief("agent-1", { cachedOnly: true });

    expect(rankClaims).not.toHaveBeenCalled();
    expect(brief?.ai).toBe(true);
    expect(brief?.items[0].reason).toBe("מהמטמון");
  });
});

describe("getOrCreateBrief() without cachedOnly", () => {
  it("still generates — the background warm path is unchanged", async () => {
    const brief = await getOrCreateBrief("agent-1");

    expect(rankClaims).toHaveBeenCalledOnce();
    expect(brief?.ai).toBe(true);
    expect(brief?.items[0].reason).toBe("מהמודל");
  });
});
