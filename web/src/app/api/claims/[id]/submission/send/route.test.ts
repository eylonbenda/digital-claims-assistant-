import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_ERROR } from "@/lib/email/send";

type Call = { table: string; op: "update" | "insert"; payload: Record<string, unknown>; filters: unknown[][] };

let user: { id: string } | null;
let source: Record<string, unknown> | null;
let agent: Record<string, unknown> | null;
let calls: Call[];
let updateCount: number;
let download: (path: string) => { data: Blob | null; error: unknown };

const sendEmail = vi.fn();
const runEngine = vi.fn();
const reportError = vi.fn();

const SUBMISSION = {
  insurerKey: "harel", recipient: null, cc: [], verified: false,
  subject: "תביעת צד ג׳ — דנה כהן [1a2b3c4d]", body: "שלום רב,\nמצורף התיק.",
  attachments: [
    { label: "טופס הודעה על תאונה", storagePath: "forms/c1/notice.PDF" },
    { label: "רישיון נהיגה (1/2)", storagePath: "docs/c1/abc.jpg" },
  ],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: agent, error: null });
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ download: async (path: string) => download(path) }) },
    from: (table: string) => {
      const call: Call = { table, op: "insert", payload: {}, filters: [] };
      const q: Record<string, unknown> = {};
      q.update = (payload: Record<string, unknown>) => {
        Object.assign(call, { op: "update", payload });
        calls.push(call);
        return q;
      };
      q.insert = async (payload: Record<string, unknown>) => {
        Object.assign(call, { op: "insert", payload });
        calls.push(call);
        return { error: null };
      };
      q.eq = (...f: unknown[]) => (call.filters.push(["eq", ...f]), q);
      q.is = (...f: unknown[]) => (call.filters.push(["is", ...f]), q);
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: null, count: updateCount }).then(resolve);
      return q;
    },
  }),
}));
vi.mock("@/lib/submission/build", () => ({
  loadSubmissionSource: async () => source,
  buildSubmission: (src: { submission: unknown }) => ({ checklist: [], submission: src.submission }),
}));
vi.mock("@/lib/email/provider", () => ({ sendEmail }));
vi.mock("@/lib/tasks/runner", () => ({ runEngine }));
vi.mock("@/lib/observability/report", () => ({
  reportError,
  serverError: async () => Response.json({ error: "server" }, { status: 500 }),
}));

const ENV = { EMAIL_PROVIDER_API_KEY: "k", EMAIL_WEBHOOK_SECRET: "s", EMAIL_INBOUND_DOMAIN: "in.example.com" };

async function post(body: unknown = { recipient: " Claims@Harel.co.il ", insurerKey: "harel", confirmed: true }) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/claims/c1/submission/send", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "c1" }) },
  );
}
const of = (table: string) => calls.filter((c) => c.table === table);

describe("POST /api/claims/[id]/submission/send", () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
    user = { id: "u1" };
    agent = { id: "a1", name: "מוסך כהן", claims_mailbox: "claims@garage.co.il", inbound_alias: "cohen" };
    source = {
      claim: { id: "c1", claim_type: "third_party_report", checklist_state: { police_report: true } },
      handlingStatus: null,
      status: "submitted",
      submission: SUBMISSION,
    };
    calls = [];
    updateCount = 1;
    download = () => ({ data: new Blob([new Uint8Array(1000)]), error: null });
    for (const fn of [sendEmail, runEngine, reportError]) fn.mockReset();
    sendEmail.mockResolvedValue({ providerId: "prov-9" });
  });
  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  it("refuses an unauthenticated request", async () => {
    user = null;
    expect((await post()).status).toBe(401);
  });

  it("is off when email is not configured", async () => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    expect((await post()).status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("needs the explicit confirmation", async () => {
    expect((await post({ recipient: "claims@harel.co.il" })).status).toBe(400);
    expect((await post({ recipient: "claims@harel.co.il", confirmed: "true" })).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("answers 404 for a claim the user cannot see", async () => {
    source = null;
    expect((await post()).status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["an unclassified claim", () => { source!.submission = null; }, undefined, SEND_ERROR.noSubmission],
    ["a business with no alias", () => { agent!.inbound_alias = null; }, undefined, SEND_ERROR.notEnabled],
    ["a malformed recipient", () => {}, "not-an-email", SEND_ERROR.invalidRecipient],
    ["our own address as recipient", () => {}, "cohen@in.example.com", SEND_ERROR.notInsurer],
    ["the business's mailbox as recipient", () => {}, "claims@garage.co.il", SEND_ERROR.notInsurer],
    ["a packet over the size budget", () => {
      download = () => ({ data: new Blob([new Uint8Array(11 * 1024 * 1024)]), error: null });
    }, undefined, SEND_ERROR.tooLarge],
  ])("answers 400 for %s and sends nothing", async (_name, arrange, recipient, message) => {
    arrange();
    const res = await post({ recipient: recipient ?? "claims@harel.co.il", confirmed: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("answers 409 for a claim that is already sent, before calling the provider", async () => {
    source!.handlingStatus = "sent";
    expect((await post()).status).toBe(409);
    // A legacy claim: sent by hand before the status column existed.
    source!.handlingStatus = null;
    const { sentMilestoneFor } = await import("@/lib/handling/transitions");
    (source!.claim as { checklist_state: Record<string, boolean> }).checklist_state = {
      [sentMilestoneFor("third_party_report")!]: true,
    };
    expect((await post()).status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not send when an attachment is missing from storage", async () => {
    download = (path) =>
      path.endsWith(".jpg") ? { data: null, error: new Error("gone") } : { data: new Blob(["x"]), error: null };
    expect((await post()).status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("sends the packet to the confirmed address with the business in copy, then records it", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = sendEmail.mock.calls[0][1];
    expect(sent).toMatchObject({
      to: "claims@harel.co.il",
      cc: ["claims@garage.co.il"],
      from: '"מוסך כהן (OpenTik)" <cohen@in.example.com>',
      replyTo: "cohen@in.example.com",
      subject: SUBMISSION.subject,
      text: SUBMISSION.body,
    });
    expect(sent.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      "טופס הודעה על תאונה.pdf",
      "רישיון נהיגה (1 2).jpg",
    ]);

    const [mark] = of("claims");
    expect(mark.op).toBe("update");
    expect(mark.payload).toMatchObject({ handling_status: "sent", at_fault_insurer: "harel" });
    expect((mark.payload.checklist_state as Record<string, boolean>).police_report).toBe(true);
    // Same compare-and-set as the manual confirm route.
    expect(mark.filters).toEqual([["eq", "id", "c1"], ["is", "handling_status", null]]);

    expect(of("claim_emails")[0].payload).toMatchObject({
      agent_id: "a1", claim_id: "c1", direction: "outbound", kind: "business", provider_id: "prov-9",
      to_addrs: ["claims@harel.co.il"], cc_addrs: ["claims@garage.co.il"], subject: SUBMISSION.subject,
    });
    expect(of("claim_events")[0].payload).toMatchObject({ claim_id: "c1", type: "submission_confirmed" });
    expect(runEngine).toHaveBeenCalledTimes(1);
  });

  it("leaves the claim unsent and records nothing when the provider refuses the message", async () => {
    sendEmail.mockRejectedValue(new Error("provider down"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(calls).toEqual([]);
    expect(runEngine).not.toHaveBeenCalled();
    // Ids only in the error context.
    expect(reportError.mock.calls[0][2]).toEqual({ claimId: "c1" });
  });

  it("does not log a second event when a concurrent confirm marked the claim first", async () => {
    updateCount = 0;
    expect((await post()).status).toBe(200);
    expect(of("claim_events")).toEqual([]);
    expect(runEngine).not.toHaveBeenCalled();
  });
});
