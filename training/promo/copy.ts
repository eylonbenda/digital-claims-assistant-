import fs from "node:fs";
import path from "node:path";

// Every word the promo shows lives here. Change the wording, then `npm run promo:render`.
// Rules: nothing here may be a number, a customer name or a promise we cannot back.

export type Audience = "garage" | "agent";
export const AUDIENCES: Audience[] = ["garage", "agent"];

export const COPY: Record<Audience, { hook: string; outcome: string; businessName: string }> = {
  garage: {
    hook: "לקוח אחרי תאונה. ועכשיו רודפים אחרי המסמכים.",
    outcome: "פחות מרדף. הרכב נכנס לעבודה עם תיק מלא.",
    businessName: "מוסך הדגמה",
  },
  agent: {
    hook: "לקוח אחרי תאונה. ועכשיו רודפים אחרי המסמכים.",
    outcome: "הלקוח מקבל שירות. אתה מקבל תיק מוכן להגשה.",
    businessName: "סוכנות הדגמה",
  },
};

export const SHARED = {
  turn: "קישור אחד. תיק מסודר.",
  client: "הלקוח ממלא ומצלם, מהטלפון",
  caseFile: "הכול מגיע מסודר לתיק אחד",
  form: "טופס ההודעה לחברת הביטוח, ממולא",
  handling: "ועוקבים אחרי התביעה מול חברת הביטוח",
  insurersLead: "עובד עם הטפסים של",
  tagline: ["פותחים תיק.", "סוגרים עניין."],
  ctaText: "לתיאום הדגמה בוואטסאפ",
  ctaPhone: "052-448-8867",
  // The "before" thread. Odd lines are the client, even lines the business.
  chat: [
    "עברתי תאונה",
    "תשלח צילום רישיון + רישיון רכב + תמונות נזק",
    "תמונה מטושטשת",
    "זה הצד הלא נכון… ומי הצד השני?",
    "אשלח מחר מבטיח",
  ],
};

// Everything one audience's video says, resolved to plain strings.
export type PromoCopy = typeof SHARED & { hook: string; outcome: string; businessName: string };
export function resolveCopy(audience: Audience): PromoCopy {
  return { ...SHARED, ...COPY[audience] };
}

// The names the landing page lists. `template` is the file in web/src/lib/formfill/templates.
export const INSURERS: { name: string; template: string }[] = [
  { name: "הראל", template: "harel" },
  { name: "מגדל", template: "migdal" },
  { name: "הפניקס", template: "phoenix" },
  { name: "מנורה", template: "menora" },
  { name: "איילון", template: "ayalon" },
  { name: "הכשרה", template: "hachshara" },
  { name: "שלמה", template: "shlomo" },
  { name: "ליברה", template: "libra" },
  { name: "AIG", template: "aig" },
];

// A name is shown only while the product really has that insurer's form.
export function insurersWithTemplate(templatesDir: string): string[] {
  return INSURERS.filter((i) => fs.existsSync(path.join(templatesDir, `${i.template}.ts`))).map((i) => i.name);
}
