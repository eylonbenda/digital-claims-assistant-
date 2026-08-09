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
  return waHref(phone, chaseMessage(opts));
}

// Generic wa.me deep link for an arbitrary pre-rendered body.
export function waHref(phone: string | null, text: string): string | null {
  const wa = phone ? waPhone(phone) : null;
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

const greet = (firstName?: string | null) =>
  firstName ? `שלום ${firstName}, בהמשך לתביעה שלך —` : `שלום, בהמשך לתביעה שלך —`;

// get_tp_insurer: the answer is a WhatsApp reply (name / photo of the TP's
// insurance card), so no upload link on purpose.
export function getTpInsurerMessage(opts: { firstName?: string | null }): string {
  return [
    greet(opts.firstName),
    `כדי שנוכל לפנות לחברת הביטוח של הצד השני, חסר לנו שם חברת הביטוח שלו.`,
    `אם יש ברשותך פרטי ביטוח מהתאונה (שם החברה או צילום התעודה) — אפשר לשלוח לי כאן.`,
    ``,
    `תודה!`,
  ].join("\n");
}

export function collectPrivateReportMessage(opts: {
  firstName?: string | null;
  items?: string[];
  uploadUrl: string;
}): string {
  const body =
    opts.items && opts.items.length
      ? [
          `כדי להגיש את הדרישה לחברת הביטוח של הצד השני חסרים המסמכים הבאים:`,
          ...opts.items.map((i) => `• ${i}`),
        ]
      : [`כדי להגיש את הדרישה לחברת הביטוח של הצד השני חסרים לנו עוד כמה מסמכים.`];
  return [greet(opts.firstName), ...body, ``, `אפשר להעלות אותם כאן: ${opts.uploadUrl}`, `תודה!`].join("\n");
}
