import { describe, expect, it } from "vitest";
import { INBOUND_MAX_BYTES } from "./budget";
import { FORWARD_HEADER } from "./classify";
import { ingestInbound, type AttachmentRow, type EmailRow, type EmailStore } from "./ingest";
import type { InboundEmail } from "./types";

const DOMAIN = "in.example.com";
const CLAIM = "6e7e3dc4-f538-4a26-8f2c-60b05adf6f75";
const OTHER_CLAIM = "0295502a-74c5-4ebb-b217-0c4857487fed";

type Fake = EmailStore & {
  emails: EmailRow[];
  attachments: AttachmentRow[];
  uploads: { path: string; size: number; mime: string | null }[];
};

// Two businesses: "cohen" owns CLAIM, "levi" owns OTHER_CLAIM.
function fakeStore(over: Partial<EmailStore> = {}): Fake {
  const agents: Record<string, { id: string; claims_mailbox: string | null }> = {
    cohen: { id: "agent-cohen", claims_mailbox: "claims@garage.co.il" },
    levi: { id: "agent-levi", claims_mailbox: null },
  };
  const claims: Record<string, string[]> = { "agent-cohen": [CLAIM], "agent-levi": [OTHER_CLAIM] };
  const store: Fake = {
    emails: [], attachments: [], uploads: [],
    hasProviderId: async (id) => store.emails.some((e) => e.provider_id === id),
    agentByAlias: async (alias) => agents[alias] ?? null,
    claimIds: async (agentId) => claims[agentId] ?? [],
    threadIndex: async (agentId) =>
      new Map(
        store.emails
          .filter((e) => e.agent_id === agentId && e.claim_id && e.message_id)
          .map((e) => [e.message_id!, e.claim_id!]),
      ),
    upload: async (path, bytes, mime) => { store.uploads.push({ path, size: bytes.length, mime }); },
    insertEmail: async (row) => { store.emails.push(row); },
    insertAttachments: async (rows) => { store.attachments.push(...rows); },
    ...over,
  };
  return store;
}

function email(over: Partial<InboundEmail> = {}): InboundEmail {
  return {
    providerId: "prov-1", messageId: "<m1@fnx.co.il>", inReplyTo: null, references: [],
    from: "Dana <dana@fnx.co.il>", to: ["cohen@in.example.com"], cc: [],
    subject: "RE: תביעת נזקי רכוש — 6e7e3dc4", text: "קיבלנו.", headers: {}, attachments: [],
    ...over,
  };
}
const file = (filename: string, size = 3) => ({
  filename, mime: "application/pdf", size, download: async () => new Uint8Array(size),
});
const opts = { inboundDomain: DOMAIN, insurerDomains: ["fnx.co.il"], newId: () => "email-1" };

describe("ingestInbound", () => {
  it("stores a reply and files it on the claim named in the subject", async () => {
    const store = fakeStore();
    const result = await ingestInbound(email({ attachments: [file("אישור.pdf")] }), store, opts);

    expect(result).toEqual({ outcome: "stored", emailId: "email-1", agentId: "agent-cohen", claimId: CLAIM, kind: "insurer" });
    expect(store.emails).toHaveLength(1);
    expect(store.emails[0]).toMatchObject({
      id: "email-1", agent_id: "agent-cohen", claim_id: CLAIM, direction: "inbound", kind: "insurer",
      provider_id: "prov-1", from_addr: "dana@fnx.co.il", match_method: "subject_id",
      text_body: "קיבלנו.", attachments_dropped: false,
    });
    expect(store.uploads).toEqual([{ path: "emails/agent-cohen/email-1/0-file.pdf", size: 3, mime: "application/pdf" }]);
    expect(store.attachments).toEqual([
      { email_id: "email-1", filename: "אישור.pdf", mime: "application/pdf", size_bytes: 3, storage_path: "emails/agent-cohen/email-1/0-file.pdf" },
    ]);
  });

  it("does nothing on a second delivery of the same message", async () => {
    const store = fakeStore();
    await ingestInbound(email({ attachments: [file("a.pdf")] }), store, opts);
    expect(await ingestInbound(email({ attachments: [file("a.pdf")] }), store, opts)).toEqual({ outcome: "duplicate" });
    expect(store.emails).toHaveLength(1);
    expect(store.uploads).toHaveLength(1);
  });

  it("never files a message on another business's claim", async () => {
    const store = fakeStore();
    // Sent to levi, but the subject carries cohen's claim id.
    const result = await ingestInbound(email({ to: ["levi@in.example.com"] }), store, opts);
    expect(result).toMatchObject({ outcome: "stored", agentId: "agent-levi", claimId: null });
    expect(store.emails[0]).toMatchObject({ agent_id: "agent-levi", claim_id: null, match_method: null });
  });

  it("stores a message it cannot file, for manual assignment", async () => {
    const store = fakeStore();
    const result = await ingestInbound(email({ subject: "תביעה 2026/4471 — עדכון" }), store, opts);
    expect(result).toMatchObject({ outcome: "stored", claimId: null });
  });

  it("follows a thread once its first message is on a claim", async () => {
    const store = fakeStore();
    let n = 0;
    const o = { ...opts, newId: () => `email-${++n}` };
    await ingestInbound(email(), store, o);
    const reply = email({ providerId: "prov-2", messageId: "<m2@fnx.co.il>", subject: "עדכון", inReplyTo: "<m1@fnx.co.il>" });
    expect(await ingestInbound(reply, store, o)).toMatchObject({ outcome: "stored", claimId: CLAIM });
    expect(store.emails[1].match_method).toBe("thread");
  });

  it("drops our own forwarded copy before touching the database", async () => {
    const calls: string[] = [];
    const store = fakeStore({ hasProviderId: async () => { calls.push("hasProviderId"); return false; } });
    expect(await ingestInbound(email({ headers: { [FORWARD_HEADER.toLowerCase()]: "1" } }), store, opts)).toEqual({ outcome: "own_mail" });
    expect(await ingestInbound(email({ from: "OpenTik <cohen@in.example.com>" }), store, opts)).toEqual({ outcome: "own_mail" });
    expect(calls).toEqual([]);
    expect(store.emails).toHaveLength(0);
  });

  it("reports an address nobody owns without storing anything", async () => {
    const store = fakeStore();
    expect(await ingestInbound(email({ to: ["nobody@in.example.com"] }), store, opts)).toEqual({ outcome: "unknown_alias" });
    expect(await ingestInbound(email({ to: ["x@elsewhere.com"] }), store, opts)).toEqual({ outcome: "unknown_alias" });
    expect(store.emails).toHaveLength(0);
  });

  it("finds the business when it is only in copy", async () => {
    const store = fakeStore();
    const result = await ingestInbound(email({ to: ["someone@fnx.co.il"], cc: ["Cohen@in.example.com"] }), store, opts);
    expect(result).toMatchObject({ outcome: "stored", agentId: "agent-cohen" });
  });

  it("stores an oversized message without its files and says so", async () => {
    const store = fakeStore();
    await ingestInbound(email({ attachments: [file("big.pdf", INBOUND_MAX_BYTES), file("more.pdf", 1)] }), store, opts);
    expect(store.uploads).toHaveLength(0);
    expect(store.attachments).toHaveLength(0);
    expect(store.emails[0].attachments_dropped).toBe(true);
  });

  it("does not flag a message that simply has no attachments", async () => {
    const store = fakeStore();
    await ingestInbound(email(), store, opts);
    expect(store.emails[0].attachments_dropped).toBe(false);
  });

  it("never turns an attachment filename into a path", async () => {
    const store = fakeStore();
    await ingestInbound(email({ attachments: [file("../../סריקה 1.pdf"), file("")] }), store, opts);
    for (const u of store.uploads) {
      expect(u.path.startsWith("emails/agent-cohen/email-1/")).toBe(true);
      expect(u.path.slice("emails/agent-cohen/email-1/".length)).not.toMatch(/\/|\.\./);
    }
    expect(store.attachments.map((a) => a.filename)).toEqual(["../../סריקה 1.pdf", "file"]);
  });

  it("stores a message with no text body", async () => {
    const store = fakeStore();
    await ingestInbound(email({ text: null }), store, opts);
    expect(store.emails[0].text_body).toBeNull();
  });

  it("labels mail from the business's own mailbox, and unknown senders", async () => {
    const store = fakeStore();
    let n = 0;
    const o = { ...opts, newId: () => `email-${++n}` };
    await ingestInbound(email({ from: "claims@garage.co.il" }), store, o);
    await ingestInbound(email({ providerId: "prov-2", from: "x@gmail.com" }), store, o);
    expect(store.emails.map((e) => e.kind)).toEqual(["business", "other"]);
  });

  it("writes no row when an attachment cannot be stored, so the retry can", async () => {
    const store = fakeStore({ upload: async () => { throw new Error("storage down"); } });
    await expect(ingestInbound(email({ attachments: [file("a.pdf")] }), store, opts)).rejects.toThrow("storage down");
    expect(store.emails).toHaveLength(0);
    // The retry is not mistaken for a duplicate.
    expect(await store.hasProviderId("prov-1")).toBe(false);
  });
});
