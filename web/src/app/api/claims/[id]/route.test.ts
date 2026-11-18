import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal chainable Supabase fakes. The auth client answers the ownership + guard
// reads (RLS-scoped in prod); the service client reads the file paths and writes.
type Err = { code?: string; message: string } | null;
const initial = () => ({
  user: { id: "u1" } as { id: string } | null,
  claim: { id: "c1", handling_status: null, checklist_state: {}, claim_type: "own_policy" } as
    | { id: string; handling_status: string | null; checklist_state: Record<string, boolean>; claim_type: string }
    | null,
  outboundEmails: 0,
  emailsError: null as Err,
  docs: [{ storage_path: "c1/drivers_license/1.jpg" }],
  forms: [{ storage_path: "c1/forms/migdal-1.pdf" }],
  pathsError: null as Err,
  deleteCount: 1,
  removeError: null as Err,
  writes: [] as string[],
});
let state = initial();

// A chain that is both chainable and awaitable, like a PostgREST builder.
function chain<T>(result: () => T) {
  const c = {
    select: () => c,
    eq: () => c,
    is: () => c,
    single: async () => result(),
    then: (resolve: (v: T) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) =>
      t === "claims"
        ? chain(() => ({ data: state.claim }))
        : chain(() => ({ count: state.emailsError ? null : state.outboundEmails, error: state.emailsError })),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => ({
      select: () =>
        chain(() => ({
          data: state.pathsError ? null : t === "claim_documents" ? state.docs : state.forms,
          error: state.pathsError,
        })),
      delete: () =>
        chain(() => {
          state.writes.push(`delete ${t}`);
          return { error: null, count: state.deleteCount };
        }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          state.writes.push(`remove ${paths.join(",")}`);
          return { error: state.removeError };
        },
      }),
    },
  }),
}));

const reportError = vi.fn(async () => {});
vi.mock("@/lib/observability/report", () => ({
  reportError: (...a: unknown[]) => reportError(...(a as [])),
  serverError: async () => Response.json({ error: "server" }, { status: 500 }),
}));

const { DELETE } = await import("./route");

const run = () => DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "c1" }) });

beforeEach(() => {
  state = initial();
  reportError.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("DELETE /api/claims/[id]", () => {
  it("deletes the row, then every Storage object of the claim", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(state.writes).toEqual([
      "delete claims",
      "remove c1/drivers_license/1.jpg,c1/forms/migdal-1.pdf",
    ]);
  });

  it("skips Storage when the claim has no files", async () => {
    state.docs = [];
    state.forms = [];
    expect((await run()).status).toBe(200);
    expect(state.writes).toEqual(["delete claims"]);
  });

  it("401 without a session", async () => {
    state.user = null;
    expect((await run()).status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it("404 for a claim the agent can't see", async () => {
    state.claim = null;
    expect((await run()).status).toBe(404);
    expect(state.writes).toEqual([]);
  });

  it("409 once the claim was sent to the insurer", async () => {
    state.claim!.handling_status = "sent";
    const res = await run();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("סגירה");
    expect(state.writes).toEqual([]);
  });

  it("409 for a legacy claim sent by hand (milestone ticked)", async () => {
    state.claim!.checklist_state = { submitted_to_insurer: true };
    expect((await run()).status).toBe(409);
    expect(state.writes).toEqual([]);
  });

  it("409 when an email already went out on the claim", async () => {
    state.outboundEmails = 1;
    expect((await run()).status).toBe(409);
    expect(state.writes).toEqual([]);
  });

  it("proceeds when the emails table does not exist yet (migration 013 not applied)", async () => {
    state.emailsError = { code: "PGRST205", message: "no table" };
    expect((await run()).status).toBe(200);
    expect(state.writes[0]).toBe("delete claims");
  });

  it("500 and no delete when the emails guard cannot be read", async () => {
    state.emailsError = { code: "57014", message: "timeout" };
    expect((await run()).status).toBe(500);
    expect(state.writes).toEqual([]);
  });

  it("500 and no delete when the file paths cannot be read (would orphan the files)", async () => {
    state.pathsError = { message: "boom" };
    expect((await run()).status).toBe(500);
    expect(state.writes).toEqual([]);
  });

  it("409 when a concurrent send wins the race — nothing is removed", async () => {
    state.deleteCount = 0;
    expect((await run()).status).toBe(409);
    expect(state.writes).toEqual(["delete claims"]);
  });

  it("still succeeds when Storage removal fails, and reports it", async () => {
    state.removeError = { message: "storage down" };
    expect((await run()).status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
