// Israeli local mobile → wa.me international format (0521234567 → 972521234567).
export function waPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;
  return null;
}

export type ChaseOpts = {
  firstName?: string | null;
  items?: string[]; // blocking-doc labels; omit/empty → generic line
  uploadUrl: string;
};

// One chase-message builder for every surface (claim cockpit strip, morning
// brief) so the copy can't drift between them.
export function chaseMessage(opts: ChaseOpts): string {
  const greeting = opts.firstName
    ? `שלום ${opts.firstName}, בהמשך לתביעה שלך —`
    : `שלום, בהמשך לתביעה שלך —`;
  const body =
    opts.items && opts.items.length
      ? [
          `כדי שנוכל להתקדם מול חברת הביטוח חסרים המסמכים הבאים:`,
          ...opts.items.map((i) => `• ${i}`),
        ]
      : [`עדיין חסרים לנו מסמכים כדי להתקדם מול חברת הביטוח.`];
  return [greeting, ...body, ``, `אפשר להעלות אותם כאן: ${opts.uploadUrl}`, `תודה!`].join("\n");
}

export function chaseHref(phone: string | null, opts: ChaseOpts): string | null {
  const wa = phone ? waPhone(phone) : null;
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(chaseMessage(opts))}`;
}
