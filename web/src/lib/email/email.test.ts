import { describe, expect, it } from "vitest";
import type { Submission } from "@/lib/submission/compose";
import { INBOUND_MAX_BYTES, OUTBOUND_MAX_BYTES, overBudget, storageName } from "./budget";
import { FORWARD_HEADER, addressOf, classifyKind, isOwnMail, parseAlias } from "./classify";
import { emailConfig, inboundAddress } from "./config";
import { FORWARD_SUBJECT_PREFIX, planForward } from "./forward";
import { extractShortIds, matchClaim } from "./match";
import { SEND_ERROR, planSend } from "./send";

const DOMAIN = "in.example.com";

describe("emailConfig", () => {
  const full = { EMAIL_PROVIDER_API_KEY: "k", EMAIL_WEBHOOK_SECRET: "s", EMAIL_INBOUND_DOMAIN: "IN.Example.com" };

  it("is on only when all three variables are set", () => {
    expect(emailConfig(full)).toEqual({ apiKey: "k", webhookSecret: "s", inboundDomain: DOMAIN });
    for (const key of Object.keys(full)) {
      expect(emailConfig({ ...full, [key]: undefined })).toBeNull();
      expect(emailConfig({ ...full, [key]: "  " })).toBeNull();
    }
  });

  it("builds a business address", () => {
    expect(inboundAddress("a-x1", DOMAIN)).toBe("a-x1@in.example.com");
  });
});

describe("addressOf / parseAlias", () => {
  it("reads a named or bare address, lower-cased", () => {
    expect(addressOf("Name <A@B.co>")).toBe("a@b.co");
    expect(addressOf("  A@B.co ")).toBe("a@b.co");
    expect(addressOf("no address here")).toBe("");
  });

  it("finds the alias of the first recipient on our domain", () => {
    expect(parseAlias(["Bob <b@x.com>", "Moshe-X7@in.example.com"], DOMAIN)).toBe("moshe-x7");
    expect(parseAlias(["b@x.com"], DOMAIN)).toBeNull();
    // A lookalike domain is not ours.
    expect(parseAlias(["a@evil-in.example.com", "a@in.example.com.evil.io"], DOMAIN)).toBeNull();
  });
});

describe("classifyKind", () => {
  it("recognises the business mailbox, insurers by domain or subdomain, and the rest", () => {
    expect(classifyKind("Dana <Claims@Garage.co.il>", "claims@garage.co.il", [])).toBe("business");
    expect(classifyKind("x@fnx.co.il", null, ["fnx.co.il"])).toBe("insurer");
    expect(classifyKind("x@claims.fnx.co.il", null, ["fnx.co.il"])).toBe("insurer");
    expect(classifyKind("x@notfnx.co.il", null, ["fnx.co.il"])).toBe("other");
    expect(classifyKind("x@gmail.com", null, ["fnx.co.il", ""])).toBe("other");
  });

  it("never calls anything 'business' without a known mailbox", () => {
    expect(classifyKind("claims@garage.co.il", null, [])).toBe("other");
  });
});

describe("isOwnMail — loop guard", () => {
  it("is true for a sender on our inbound domain", () => {
    expect(isOwnMail({ from: "OpenTik <moshe-x7@in.example.com>", headers: {} }, DOMAIN)).toBe(true);
  });

  it("is true for our forward header in any case", () => {
    expect(isOwnMail({ from: "x@garage.co.il", headers: { [FORWARD_HEADER.toLowerCase()]: "1" } }, DOMAIN)).toBe(true);
    expect(isOwnMail({ from: "x@garage.co.il", headers: { [FORWARD_HEADER]: "1" } }, DOMAIN)).toBe(true);
  });

  it("is false for an insurer with unrelated headers", () => {
    expect(isOwnMail({ from: "x@fnx.co.il", headers: { "X-Mailer": "Outlook" } }, DOMAIN)).toBe(false);
  });
});

describe("matchClaim", () => {
  const A = "6e7e3dc4-f538-4a26-8f2c-60b05adf6f75";
  const B = "0295502a-74c5-4ebb-b217-0c4857487fed";
  const none = { inReplyTo: null, references: [] };
  const noThread = new Map<string, string>();

  it("matches the short id even with an 8-digit plate beside it", () => {
    const subject = "תביעת נזקי רכוש — מבוטחכם 19510404 — נפגע 4521837 — 6e7e3dc4";
    expect(extractShortIds(subject)).toEqual(["19510404", "6e7e3dc4"]);
    expect(matchClaim({ subject, ...none }, { claimIds: [A, B], claimByMessageId: noThread })).toEqual({
      claimId: A, method: "subject_id",
    });
  });

  it("survives Fwd/RE prefixes and upper case", () => {
    expect(
      matchClaim({ subject: "Fwd: RE: בקשת הסדר — 6E7E3DC4", ...none }, { claimIds: [A], claimByMessageId: noThread }),
    ).toEqual({ claimId: A, method: "subject_id" });
  });

  it("does not match a token that belongs to no claim of this business", () => {
    expect(matchClaim({ subject: "— 6e7e3dc4", ...none }, { claimIds: [B], claimByMessageId: noThread })).toBeNull();
  });

  it("does not trust two tokens that name two claims, and falls back to the thread", () => {
    const subject = "6e7e3dc4 0295502a";
    const candidates = { claimIds: [A, B], claimByMessageId: new Map([["<m1>", B]]) };
    expect(matchClaim({ subject, ...none }, candidates)).toBeNull();
    expect(matchClaim({ subject, inReplyTo: "<m1>", references: [] }, candidates)).toEqual({
      claimId: B, method: "thread",
    });
  });

  it("matches by References when there is no token", () => {
    expect(
      matchClaim(
        { subject: "אישור קבלה", inReplyTo: null, references: ["<x>", "<known>"] },
        { claimIds: [A], claimByMessageId: new Map([["<known>", A]]) },
      ),
    ).toEqual({ claimId: A, method: "thread" });
  });

  it("returns null with nothing to go on", () => {
    expect(matchClaim({ subject: "שלום", ...none }, { claimIds: [A], claimByMessageId: noThread })).toBeNull();
  });
});

describe("budget / storageName", () => {
  it("compares the total against the limit, inclusive", () => {
    expect(overBudget([10e6, 11e6], OUTBOUND_MAX_BYTES)).toBe(true);
    expect(overBudget([OUTBOUND_MAX_BYTES], OUTBOUND_MAX_BYTES)).toBe(false);
    expect(overBudget([], INBOUND_MAX_BYTES)).toBe(false);
  });

  it("never lets a filename become a path", () => {
    const name = storageName(2, "../סריקה 1.pdf");
    expect(name).toMatch(/^2-[A-Za-z0-9._-]+\.pdf$/);
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
    expect(storageName(1, "a/../../b.jpg")).not.toMatch(/\.\.|\//);
    expect(storageName(0, "")).toBe("0-file");
    expect(storageName(0, "חשבונית")).toBe("0-file");
    expect(storageName(3, "x".repeat(200) + ".pdf").length).toBeLessThanOrEqual(82);
  });
});

describe("planSend", () => {
  const submission = { subject: "תביעת נזקי רכוש — 6e7e3dc4", body: "שלום רב,\nמצורפת דרישתנו." } as Submission;
  const business = { name: "מוסך כהן", claimsMailbox: "Claims@Garage.co.il", inboundAlias: "cohen-x7k2" };
  const base = { business, inboundDomain: DOMAIN, recipient: " Claims@FNX.co.il ", submission, sizes: [1000] };

  it("plans a message from the business's system address with the business in copy", () => {
    expect(planSend(base)).toEqual({
      from: '"מוסך כהן (OpenTik)" <cohen-x7k2@in.example.com>',
      replyTo: "cohen-x7k2@in.example.com",
      to: "claims@fnx.co.il",
      cc: ["claims@garage.co.il"],
      subject: submission.subject,
      text: submission.body,
    });
  });

  it("reports the first failing condition, in order", () => {
    const broken = {
      ...base, submission: null, business: { ...business, inboundAlias: null },
      recipient: "nope", sizes: [OUTBOUND_MAX_BYTES + 1],
    };
    expect(planSend(broken)).toEqual({ error: SEND_ERROR.noSubmission });
    expect(planSend({ ...broken, submission })).toEqual({ error: SEND_ERROR.notEnabled });
    expect(planSend({ ...broken, submission, business })).toEqual({ error: SEND_ERROR.invalidRecipient });
    expect(planSend({ ...base, sizes: [OUTBOUND_MAX_BYTES + 1] })).toEqual({ error: SEND_ERROR.tooLarge });
  });

  it("refuses our own address or the business's own mailbox as the insurer", () => {
    expect(planSend({ ...base, recipient: "other-biz@in.example.com" })).toEqual({ error: SEND_ERROR.notInsurer });
    expect(planSend({ ...base, recipient: "claims@garage.co.il" })).toEqual({ error: SEND_ERROR.notInsurer });
  });

  it("sends without a copy when no claims mailbox is set", () => {
    const plan = planSend({ ...base, business: { ...business, claimsMailbox: null } });
    expect("cc" in plan && plan.cc).toEqual([]);
  });

  it("keeps quotes and line breaks out of the display name", () => {
    const plan = planSend({ ...base, business: { ...business, name: 'מוסך "כהן"\r\nBcc: x@evil.io' } });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.from).not.toMatch(/[\r\n]/);
    expect(plan.from.match(/"/g)).toHaveLength(2);
    expect(planSend({ ...base, business: { ...business, name: "  " } })).toMatchObject({
      from: "OpenTik <cohen-x7k2@in.example.com>",
    });
  });
});

describe("planForward", () => {
  const email = { from: "Dana <dana@fnx.co.il>", subject: "RE: תביעה — 6e7e3dc4", text: " קיבלנו. \n" };

  it("copies the message to the business mailbox, naming the original sender", () => {
    expect(planForward(email, "Claims@Garage.co.il", DOMAIN, "cohen-x7k2")).toEqual({
      to: "claims@garage.co.il",
      from: "OpenTik <cohen-x7k2@in.example.com>",
      subject: `${FORWARD_SUBJECT_PREFIX}RE: תביעה — 6e7e3dc4`,
      text: "התקבל מייל מאת dana@fnx.co.il.\n\nקיבלנו.",
    });
  });

  it("still names the sender when the message has no text", () => {
    expect(planForward({ ...email, text: null }, "claims@garage.co.il", DOMAIN, "a")?.text).toBe(
      "התקבל מייל מאת dana@fnx.co.il.",
    );
  });

  it("does nothing without a claims mailbox", () => {
    expect(planForward(email, null, DOMAIN, "a")).toBeNull();
    expect(planForward(email, "not an address", DOMAIN, "a")).toBeNull();
  });
});
