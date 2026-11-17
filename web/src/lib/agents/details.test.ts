import { describe, it, expect } from "vitest";
import { parseBusinessDetails, parseClaimsMailbox } from "./details";

describe("parseClaimsMailbox", () => {
  it("is absent when the request does not carry the field", () => {
    expect(parseClaimsMailbox({ name: "x" })).toEqual({ absent: true });
    expect(parseClaimsMailbox(null)).toEqual({ absent: true });
  });
  it("trims and lower-cases a valid address", () => {
    expect(parseClaimsMailbox({ claims_mailbox: "  Claims@Garage.co.il " })).toEqual({
      ok: true, value: "claims@garage.co.il",
    });
  });
  it("clears on an empty value", () => {
    expect(parseClaimsMailbox({ claims_mailbox: "  " })).toEqual({ ok: true, value: null });
    expect(parseClaimsMailbox({ claims_mailbox: null })).toEqual({ ok: true, value: null });
  });
  it("rejects anything that is not an address", () => {
    expect(parseClaimsMailbox({ claims_mailbox: "not-an-email" })).toMatchObject({ ok: false });
    expect(parseClaimsMailbox({ claims_mailbox: 7 })).toMatchObject({ ok: false });
  });
});

describe("parseBusinessDetails", () => {
  it("trims a valid input", () => {
    const r = parseBusinessDetails({ name: "  מוסך כהן ", phone: " 050-1234567 ", email: " a@b.co " });
    expect(r).toEqual({ ok: true, value: { name: "מוסך כהן", phone: "050-1234567", email: "a@b.co" } });
  });
  it("rejects a missing or blank name", () => {
    expect(parseBusinessDetails({ phone: "0501234567" }).ok).toBe(false);
    expect(parseBusinessDetails({ name: "   " }).ok).toBe(false);
    expect(parseBusinessDetails(null).ok).toBe(false);
  });
  it("rejects an 81-char name, accepts 80", () => {
    expect(parseBusinessDetails({ name: "א".repeat(81) }).ok).toBe(false);
    expect(parseBusinessDetails({ name: "א".repeat(80) }).ok).toBe(true);
  });
  it("rejects a bad phone", () => {
    const r = parseBusinessDetails({ name: "x", phone: "123" });
    expect(r).toEqual({ ok: false, error: "מספר טלפון לא תקין" });
  });
  it("rejects a bad email", () => {
    expect(parseBusinessDetails({ name: "x", email: "nope" }).ok).toBe(false);
  });
  it("turns empty phone/email into null", () => {
    expect(parseBusinessDetails({ name: "x", phone: "  ", email: "" })).toEqual({
      ok: true,
      value: { name: "x", phone: null, email: null },
    });
    expect(parseBusinessDetails({ name: "x" })).toEqual({
      ok: true,
      value: { name: "x", phone: null, email: null },
    });
  });
});
