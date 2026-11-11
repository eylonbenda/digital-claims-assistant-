export function validatePhone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 0) return null;
  return d.length === 9 || d.length === 10 ? null : "מספר טלפון לא תקין";
}
