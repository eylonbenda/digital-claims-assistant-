---
name: meeting-to-canvas
description: Turn a customer-meeting transcript (Zoom / Fathom / tl;dv / pasted text) into evidence-backed updates to docs/assumptions-canvas.md and the numbers table in docs/validation-guide.md, applying Mom Test discipline — only past behavior and commitments move a status, compliments and hypotheticals do not. Use when the user says "/meeting-to-canvas", "update the canvas from the call", "process the meeting with the garage owner", "עדכן את הקנבס מהשיחה", or hands over a transcript of a validation / pricing / workflow call.
---

# meeting-to-canvas

Automates the "אחרי השיחה" step of `docs/validation-guide.md`: read what was actually said on a customer call, map it to the assumption IDs in `docs/assumptions-canvas.md`, and update the canvas **only where the evidence earns it**.

The failure this skill exists to prevent: a friendly call gets read as validation. A customer saying "מגניב, הייתי משתמש בזה" moves nothing. A canvas full of ✅ from compliments is worse than one full of ⬜.

## Scope (what this skill may edit)
- `docs/assumptions-canvas.md` — status, evidence column, "מה עוד חסר", success metrics, יומן שיחות, יומן החלטות (only if the user actually decided something).
- `docs/validation-guide.md` — **only** the `___` cells of the numbers tables, and only with a number the customer stated as fact (see step 3 for the price cell).
- Nothing else. No code, no other docs.

## 1. Get the transcript
In this order:
1. A path the user gave → read it.
2. A meeting connector is connected (Zoom for Claude, Fathom, tl;dv, Grain — check with ToolSearch, e.g. `zoom transcript`) → find the meeting by date / participant the user named, pull its transcript.
3. Neither → ask the user to paste it or drop the file into `.meetings/` at the repo root.

**Raw transcripts never get committed.** They hold a customer's words verbatim and, often, details of real claimants (PII under חוק הגנת הפרטיות). If you save one, save it under `.meetings/` (gitignored); a transcript elsewhere outside the repo can stay where it is. Never copy a transcript into `docs/`, and never copy or paraphrase a claimant's identifying detail — name, ID, plate, phone, **accident date or location**, or anything that narrows down who they are. "רכב אחד, תיקון של ₪9,000" is fine; who and where is not.

## 2. Establish context before reading for evidence
Pin down, and state back to the user in one line before going further:
- **Date** of the call.
- **Who spoke, by role** — בעל מוסך (buyer) / פקידה (user) / סוכן ביטוח / other. Buyer ≠ user (canvas B5): the same sentence is different evidence depending on who said it. The employee saying "חוסך לי זמן" is V4א evidence; it is **not** B1 evidence.
- **Segment** — garage or insurance agent. Every current ✅ was earned at a garage. Evidence from an agent touches V8ב; evidence from a second garage touches V8א. Never let one segment's evidence move the other's row.
- **Call type** — discovery / workflow (canvas plan step 3) / pricing (step 2); often more than one. It tells you which rows to expect movement on.

If any of these is unclear from the transcript — or a number in it is internally inconsistent (e.g. "40 באוקטובר" said on Oct 7) — ask, don't guess.

## 3. Extract evidence
Walk the transcript and pull every statement that bears on an assumption ID. For each one, classify its strength:

| Strength | What it looks like | Can it move a status? |
|---|---|---|
| **Commitment** | Agreed to pay, gave a start date, signed, introduced another garage, gave access to data | Yes — strongest |
| **Past behavior** | "בחודש שעבר היו לי 3 רכבים שהלכו למוסך אחר כי..." — specific, happened, unprompted | Yes |
| **Stated number** | Claims/month, repair value, days to payment, a price he named | Yes, for the matching row / `___` cell |
| **Opinion / hypothetical** | "הייתי משתמש", "נשמע טוב", "כמה היית מוכן לשלם?" → "אולי 300" | **No.** Record it as context, flag it as weak |
| **Compliment** | "רעיון מגניב", "תשלח לי כשמוכן" | **No.** These are 🔴 per `validation-guide.md` |

Also watch for the 🔴 / 🟢 signals in `validation-guide.md` "רמזורים" — they're the same discipline in the guide's own words.

**Price (B1) is the strictest row.** Only a **commitment** moves it ("מתחילים לחייב ב-1 לחודש" accepted, a start date, a signature). A number he floated — even a specific one — never moves B1 and never fills the `כמה היה משלם` cell; it goes in B1's evidence text as "~₪X (צף, לא מחויבות)". A floated number followed by "בוא נדבר על זה אחר כך" is a deferral — say so; it is the 🔴 "תשלח לי כשיהיה מוכן" in pricing form.

**A referral** ("אני אשלח לך מספר של מוסך אחר") is a commitment that shows he values it — record it on B3/V8א as evidence, but it moves no status until it's delivered and the second customer shows the pain themselves. Note it as an open follow-up.

**Risk-phrased rows** (B4, B5, V4ב): the status always answers "does the assumption *as written* hold?" — ✅ = it holds, ❌ = it doesn't. Read the row's wording before choosing; for V4ב, ✅ means "no extra system to maintain", so evidence that they keep a parallel Excel pushes it toward ❌.

Look as hard for **disconfirming** evidence as for confirming. A row going ✅ → 🟡 or 🟡 → ❌ is as valuable as the reverse, and easier to miss on a warm call. When the disconfirmation is an inference that needs checking (e.g. "was that stuck claim even in our system?"), don't change the status — mark the row "(שאלה פתוחה)" and say what would settle it.

**Numbers tables:** fill only the table for the call's segment (garage table for a garage call). A number that fits only the other table's row goes into the relevant assumption's evidence text instead — don't add rows to the guide.

## 4. Propose before writing
Show the user a table, in Hebrew, before touching any file:

| # | הנחה | עכשיו | מוצע | ראיה (ציטוט קצר) | חוזק |
|---|---|---|---|---|---|

Rules for the table:
- The `הנחה` column names the row as the canvas words it (even where the canvas still says "סוכן"); quotes are short (≤ one sentence), attributed by role ("בעל המוסך"), never by name, and contain no claimant PII.
- Include rows where evidence exists but doesn't justify a status change — "ראיה נוספה, סטטוס נשאר" is a normal outcome.
- List separately: numbers for `validation-guide.md` `___` cells, and anything said that fits no existing assumption (a candidate new row — propose it, don't add silently).
- List **תיקוני עובדות בקנבס** — anything said that contradicts the canvas's own narrative (e.g. the canvas says the customer hasn't seen the task screen, and the employee says she has). These matter more than a status change: they mean other conclusions in the canvas rest on a wrong fact.
- Say plainly which of the call's expected rows got **no** evidence (e.g. a pricing call where B1 still didn't move). That gap is the most useful line in the output.

Wait for the user to confirm or correct. They were on the call; you only have the text.

## 5. Apply
After confirmation, edit `docs/assumptions-canvas.md`:
- Update the status emoji and the **ראיה מהשטח** cell of each confirmed row. Prepend the dated evidence (`*(2026-MM-DD, שיחת מחיר)*`) and keep the earlier evidence — the column is a history, not a snapshot.
- Update **מה עוד חסר** — remove what the call answered, sharpen what it narrowed.
- Tick a **מדדי הצלחה** box only when its criterion is literally met.
- Add one row to **יומן שיחות** (create the section just above **יומן החלטות** if missing):
  `| תאריך | עם מי (תפקיד) | סגמנט | סוג שיחה (אפשר כמה) | הנחות שזזו | הנחות שלא זזו | follow-up פתוח |`
- Apply the confirmed **תיקוני עובדות** to the evidence text they contradict.
- Add to **יומן החלטות** only if the user made a decision (build / change / recruit another customer — step 3 of "אחרי השיחה").
- If the canvas header has a dated status line, refresh it.

Then fill the confirmed `___` cells in `docs/validation-guide.md` — garage table for a garage call, agent table for an agent call.

Keep the existing writing style: Hebrew prose, English for code identifiers, bold for the load-bearing word, ⚠️ / 🚩 for warnings.

## 6. Ship
Per the repo workflow: in a worktree off `origin/main`, branch `docs/canvas-<yyyy-mm-dd>-<call-type>`, commit, push, `gh pr create`. PR body: the table from step 4 (as confirmed) plus the "rows that didn't move" line. Check `git status` before committing that nothing under `.meetings/` is staged.
