import { validatePhone } from "@/lib/validation/phone";

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
