# דוגמאות טפסים ממולאים — filled examples

טופסי "הודעה על תאונה" של כל 9 המבטחים, ממולאים אוטומטית מתביעת הדמו (`web/src/lib/formfill/sample-claim.ts`) דרך מנוע המילוי של האפליקציה. נועדו לביקורת ויזואלית מהירה ולהדגמה — בלי להריץ כלום.

לרענון אחרי שינוי תבנית:

```bash
cd web
npx tsx scripts/fill.ts <insurer> ../docs/accidentStatementPdf/filled-examples/<insurer>.pdf
```

`<insurer>` ∈ hachshara · migdal · menora · harel · aig · shlomo · libra · phoenix · ayalon

| קובץ | מבטח | שדות ממולאים |
|---|---|---|
| hachshara.pdf | הכשרה | 45 |
| migdal.pdf | מגדל | 37 |
| menora.pdf | מנורה | 40 |
| harel.pdf | הראל | 57 |
| aig.pdf | AIG | 61 |
| shlomo.pdf | שלמה | 75 |
| libra.pdf | ליברה | 49 |
| phoenix.pdf | הפניקס | 87 |
| ayalon.pdf | איילון | 63 |

הערה: ספירת השדות היא פלט `fill.ts` — מספר הערכים שצוירו בפועל מתביעת הדמו (כולל סימוני X בצ'קבוקסים), לא מספר הכניסות בתבנית.
