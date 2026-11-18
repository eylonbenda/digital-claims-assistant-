import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhook = vi.fn();
const readInbound = vi.fn();
const ingestInbound = vi.fn();
const sendEmail = vi.fn();
const readDeliveryFailure = vi.fn();
const recordDeliveryFailure = vi.fn();
const reportError = vi.fn();
const serverError = vi.fn(async (...args: [string, unknown, Record<string, unknown>?]) => {
  void args;
  return Response.json({ error: "server" }, { status: 500 });
});

vi.mock("@/lib/email/provider", () => ({ verifyWebhook, readInbound, sendEmail, readDeliveryFailure }));
vi.mock("@/lib/email/failure", () => ({ recordDeliveryFailure }));
vi.mock("@/lib/email/ingest", () => ({ ingestInbound }));
vi.mock("@/lib/email/store", () => ({ supabaseEmailStore: () => ({}), supabaseFailureStore: () => ({}) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/observability/report", () => ({ serverError, reportError }));

const inbound = {
  providerId: "prov-1", from: "Dana <dana@fnx.co.il>", to: ["cohen@in.example.com"], cc: [],
  subject: "RE: תביעה", text: "קיבלנו.",
};
const stored = (over: Record<string, unknown> = {}) => ({
  outcome: "stored", emailId: "e1", agentId: "a1", claimId: null, kind: "insurer",
  alias: "cohen", claimsMailbox: "claims@garage.co.il",
  files: [{ filename: "מכתב.pdf", content: new Uint8Array(10) }],
  ...over,
});

const ENV = { EMAIL_PROVIDER_API_KEY: "k", EMAIL_WEBHOOK_SECRET: "s", EMAIL_INBOUND_DOMAIN: "in.example.com" };
const received = { type: "email.received", data: { email_id: "prov-1" } };

async function post(body = "{}") {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/inbound/email", { method: "POST", body }));
}

describe("POST /api/inbound/email", () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
    for (const fn of [verifyWebhook, readInbound, ingestInbound, serverError, sendEmail, recordDeliveryFailure, reportError]) fn.mockClear();
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ providerId: "fwd-1" });
    readDeliveryFailure.mockReset();
    readDeliveryFailure.mockReturnValue(null);
  });
  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  it("is off when email is not configured", async () => {
    delete process.env.EMAIL_WEBHOOK_SECRET;
    expect((await post()).status).toBe(503);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it("refuses a request whose signature does not verify, before reading it", async () => {
    verifyWebhook.mockReturnValue(null);
    expect((await post()).status).toBe(401);
    expect(readInbound).not.toHaveBeenCalled();
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("verifies the raw body exactly as it arrived", async () => {
    verifyWebhook.mockReturnValue({ type: "email.sent", data: {} });
    await post('{"a" :  1}');
    expect(verifyWebhook.mock.calls[0][1]).toBe('{"a" :  1}');
  });

  it("acknowledges events it does not handle", async () => {
    verifyWebhook.mockReturnValue({ type: "email.delivered", data: {} });
    const res = await post();
    expect(res.status).toBe(200);
    expect(readInbound).not.toHaveBeenCalled();
  });

  it("stores a received message and answers 200", async () => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockResolvedValue({ providerId: "prov-1" });
    ingestInbound.mockResolvedValue({ outcome: "stored", emailId: "e1", agentId: "a1", claimId: null, kind: "other" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome: "stored" });
    expect(ingestInbound.mock.calls[0][2]).toMatchObject({ inboundDomain: "in.example.com" });
  });

  it.each(["duplicate", "own_mail", "unknown_alias"])("answers 200 for %s so the provider stops retrying", async (outcome) => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockResolvedValue({ providerId: "prov-1" });
    ingestInbound.mockResolvedValue({ outcome });
    expect((await post()).status).toBe(200);
  });

  it("sends the business a copy of a stored message, marked as our own", async () => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockResolvedValue(inbound);
    ingestInbound.mockResolvedValue(stored());
    expect((await post()).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const copy = sendEmail.mock.calls[0][1];
    expect(copy.to).toBe("claims@garage.co.il");
    expect(copy.from).toBe("OpenTik <cohen@in.example.com>");
    expect(copy.subject).toBe("[OpenTik] RE: תביעה");
    expect(copy.headers).toEqual({ "X-OpenTik-Forwarded": "1" });
    expect(copy.attachments.map((a: { filename: string }) => a.filename)).toEqual(["מכתב.pdf"]);
  });

  it.each([
    ["the business has no claims mailbox", stored({ claimsMailbox: null }), inbound],
    ["the business wrote the message", stored({ kind: "business" }), { ...inbound, from: "claims@garage.co.il" }],
    ["the sender copied the business directly", stored(), { ...inbound, cc: ["claims@garage.co.il"] }],
  ])("sends no copy when %s", async (_name, result, email) => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockResolvedValue(email);
    ingestInbound.mockResolvedValue(result);
    expect((await post()).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("forwards the text alone when the files are too large to send on", async () => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockResolvedValue(inbound);
    ingestInbound.mockResolvedValue(
      stored({ files: [{ filename: "big.pdf", content: new Uint8Array(21 * 1024 * 1024) }] }),
    );
    await post();
    const copy = sendEmail.mock.calls[0][1];
    expect(copy.attachments).toEqual([]);
    expect(copy.text).toContain("זמינים במערכת");
  });

  it("keeps the message and answers 200 when the copy cannot be sent", async () => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockResolvedValue(inbound);
    ingestInbound.mockResolvedValue(stored());
    sendEmail.mockRejectedValue(new Error("provider down"));
    const res = await post();
    // A non-200 would make the provider redeliver a message that is already stored.
    expect(res.status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][2]).toEqual({ emailId: "prov-1", step: "forward" });
  });

  it("records a bounced or failed send and never ingests the event", async () => {
    verifyWebhook.mockReturnValue({ type: "email.bounced", data: { email_id: "prov-9" } });
    readDeliveryFailure.mockReturnValue({ providerId: "prov-9" });
    recordDeliveryFailure.mockResolvedValue("recorded");
    const res = await post();
    expect(res.status).toBe(200);
    expect(recordDeliveryFailure.mock.calls[0][0]).toBe("prov-9");
    expect(readInbound).not.toHaveBeenCalled();
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  it("answers 5xx when a failure event cannot be recorded, so it is sent again", async () => {
    verifyWebhook.mockReturnValue({ type: "email.failed", data: { email_id: "prov-9" } });
    readDeliveryFailure.mockReturnValue({ providerId: "prov-9" });
    recordDeliveryFailure.mockRejectedValue(new Error("db down"));
    expect((await post()).status).toBe(500);
  });

  it("answers 5xx when the message cannot be fetched or stored, so the provider retries", async () => {
    verifyWebhook.mockReturnValue(received);
    readInbound.mockRejectedValue(new Error("provider down"));
    expect((await post()).status).toBe(500);
    readInbound.mockResolvedValue({ providerId: "prov-1" });
    ingestInbound.mockRejectedValue(new Error("db down"));
    expect((await post()).status).toBe(500);
    expect(serverError).toHaveBeenCalledTimes(2);
    // Ids only in the error context — no addresses, subjects or bodies.
    expect(serverError.mock.calls[0][2]).toEqual({ emailId: "prov-1" });
  });
});
