# Landing page redesign — design

Date: 2026-11-19 · Surface: `/` (`web/src/app/page.tsx`, opentik.co.il)

## Intent
The page should look like a professional product and tell the whole story, not just the first third of it. Today it covers collection and form-fill in a sentence each and says nothing about managing and tracking a claim. It also addresses only insurance agents, while both paying customers are garages.

## Goals
- A more polished, credible look, in the existing brand (logo blue, Frank Ruhl Libre headlines, Heebo body, WhatsApp demo CTA).
- Three product chapters, each explained in detail with its own visual:
  1. **איסוף** — collecting the details, documents and photos from the client.
  2. **מסמכים** — producing the documents (accident notice, demand form, the packet for the insurer).
  3. **ניהול ומעקב** — managing and tracking the claim until it is paid.
- Speak to **both segments, garage-first** (decided by the owner, 2026-11-19).

## Non-goals
- No pricing section, no sign-up flow, no blog, no new routes.
- No change to `/login`, the dashboard or the wizard.
- No new dependencies.

## Anti-goals
- **No invented proof.** No made-up statistics, customer names, logos, testimonials or time-saved numbers. Every claim on the page is something the product does today.
- No customer data or personal contact details in the repo beyond the business demo number already on the page (the repo is public).
- Mock UI must not promise features that are off by default (the AI brief; direct email sending is described only as "sending to the insurer").

## Audience and voice
- Headline audience line: "למוסכים ולסוכני ביטוח". Login link: "כניסה למערכת" (replaces "כניסת סוכנים").
- Garage-first framing: the buyer is the owner, so pains and benefits lead with **jobs not lost and money collected sooner**, and only then with the clerk's saved chasing. Wording stays neutral enough that an agent reads it as theirs ("העסק", "הלקוח", "התיק").
- The third-party tracks (דוח פרטי / הסדר) get an explicit mention — they are the sharpest differentiation and the garage's daily case.

## Approaches (for the visuals)
| | What | Trade-off |
|---|---|---|
| A | All visuals are coded mock UI (HTML/Tailwind miniatures) | Crisp at any size, animatable, readable on a phone, no PII risk. Has to be kept honest by hand. |
| B | All visuals are real screenshots of the app on demo data | Most authentic. Static, unreadable when shrunk to phone width, go stale on every UI change, and need a capture step. |
| C | **Hybrid — coded mocks for the wizard and the dashboard, the real filled form image for documents** | The form is the one place where "this is real output" is the whole point; the rest reads better as clean miniatures. |

**Chosen: C** (my call — the owner asked for outcomes, not a visual technique). The mocks copy the real UI's vocabulary: the wizard's three chapters, the claims list's stage chips (אצל הלקוח · לפני שליחה למבטחת · נשלח למבטחת · ממתין לתשלום), the cockpit's single next action, the overview's "מחכים למבטחת" aging bands.

## Page structure
1. **Sticky header** — logo, anchor links to the three chapters, "כניסה למערכת", a compact demo button.
2. **Hero** — existing headline "פותחים תיק. סוגרים עניין.", the audience line, a rewritten sub-headline that names all three chapters, the WhatsApp CTA, and the existing before/after animation (kept — it is the strongest thing on the page).
3. **Insurer strip** — all 15 insurers that have a form template today (replaces the stale list of 9).
4. **Pains** — three cards, rewritten garage-first.
5. **Overview rail** — the three chapters as one connected line (איסוף → מסמכים → ניהול ומעקב), linking down to each.
6. **Chapter 1 · איסוף** — phone-framed wizard mock beside the detail: one link over WhatsApp, no app or password; quick tap questions first; vehicle details pulled from the plate number; guided photo and document capture; progress is saved; the system knows what is still missing and prepares the reminder.
7. **Chapter 2 · מסמכים** — the real filled-form image, plus cards for: the insurer's own "הודעה על תאונה" filled automatically; the "טופס דרישה" for a third-party claim with the damage lines and VAT; the document checklist per track; the ready packet for the insurer (recipient, subject, attachments).
8. **Chapter 3 · ניהול ומעקב** — dashboard mock (claims list with stage chips, one claim's next action, an aging tile) beside the detail: every claim in one list by stage; what needs you today; tasks and deadlines; status after sending (documents requested / rejected / awaiting payment / paid); amounts and how long money has been waiting at the insurer.
9. **Privacy strip** — short: personal link per client, files stored securely, access only for the business.
10. **Closing CTA** and **footer**.

## Look
- Warm paper background kept for the hero; chapters alternate white / tinted bands with a large chapter number and a small label, so the page has rhythm instead of five similar text blocks.
- One accent (logo blue) plus WhatsApp green reserved for the CTA only.
- Mock UI in framed "device" cards with soft shadows; scroll-in reveal via CSS only, disabled under `prefers-reduced-motion`.
- Fully RTL, works at phone width (most visitors arrive from a WhatsApp link).

## Build notes (left to the builder)
- Split `page.tsx` into server components under `web/src/components/landing/`; no client JS unless the sticky header needs it.
- Read `web/node_modules/next/dist/docs/` before writing Next code (v16).
- Update page `metadata` (title, description, OG) to the two-segment wording.
- Verify with a production build served from the worktree, at desktop and phone widths.
- No migration.
