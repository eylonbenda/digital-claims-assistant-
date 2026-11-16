import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhook = vi.fn();
const readInbound = vi.fn();
const ingestInbound = vi.fn();
const serverError = vi.fn(async (...args: [string, unknown, Record<string, unknown>?]) => {
  void args;
  return Response.json({ error: "server" }, { status: 500 });
});

vi.mock("@/lib/email/provider", () => ({ verifyWebhook, readInbound }));
vi.mock("@/lib/email/ingest", () => ({ ingestInbound }));
vi.mock("@/lib/email/store", () => ({ supabaseEmailStore: () => ({}) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/observability/report", () => ({ serverError }));

const ENV = { EMAIL_PROVIDER_API_KEY: "k", EMAIL_WEBHOOK_SECRET: "s", EMAIL_INBOUND_DOMAIN: "in.example.com" };
const received = { type: "email.received", data: { email_id: "prov-1" } };

async function post(body = "{}") {
  const { POST } = await import("./route");
  return POST(new Request("http://localhost/api/inbound/email", { method: "POST", body }));
}

describe("POST /api/inbound/email", () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
    for (const fn of [verifyWebhook, readInbound, ingestInbound, serverError]) fn.mockClear();
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
