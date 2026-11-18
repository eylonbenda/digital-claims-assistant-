import { validatePhone } from "@/lib/validation/phone";
import { validRecipient } from "@/lib/submission/confirm";

export type BusinessDetails = { name: string; phone: string | null; email: string | null };

export function parseBusinessDetails(
  body: unknown,
): { ok: true; value: BusinessDetails } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const name = str(b.name);
  if (!name) return { ok: false, error: "יש להזין שם עסק" };
  if (name.length > 80) return { ok: false, error: "שם העסק ארוך מדי (עד 80 תווים)" };

  const phone = str(b.phone);
  const phoneErr = validatePhone(phone);
  if (phoneErr) return { ok: false, error: phoneErr };

  const email = str(b.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'כתובת דוא"ל לא תקינה' };
  }

  return { ok: true, value: { name, phone: phone || null, email: email || null } };
}

// The business's existing claims mailbox: copied on every send, and sent a copy of
// inbound mail. Saved on its own (the email block in settings), so it is parsed on
// its own; an empty value clears it. `absent` = the request does not carry the field.
export function parseClaimsMailbox(
  body: unknown,
): { absent: true } | { ok: true; value: string | null } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!("claims_mailbox" in b)) return { absent: true };
  const raw = b.claims_mailbox;
  if (raw === null || (typeof raw === "string" && !raw.trim())) return { ok: true, value: null };
  const value = typeof raw === "string" ? validRecipient(raw) : null;
  if (!value) return { ok: false, error: 'כתובת דוא"ל לא תקינה' };
  return { ok: true, value: value.toLowerCase() };
}
