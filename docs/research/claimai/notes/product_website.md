# ClaimAI (claimai.co.il): product inventory from the public website and its public front-end bundle

**Method (read first).** claimai.co.il is a client-rendered Angular single-page app. Raw HTML holds only `<app-root>`, so WebFetch sees almost no content. I pulled what the site serves publicly without login: HTML, headers, ~70 JS chunks, and the translation files (`/assets/i18n/heb.json`, `en.json`, `ar.json`, `ru.json`). These are served to every visitor. They contain the **landing page, FAQ, About, Terms, Privacy Policy, and the UI strings of the logged-in app** (claims, statuses, insurer portal flows, pricing plans). No login, no account, no form submission. Fetched 2026-10-16 from a non-Israeli IP; the site returned 200 with no geo-block.

**How sure each finding is:**
- **[site claim]**: marketing copy shown to visitors (landing, FAQ, About, login sidebar).
- **[UI string]**: text from the logged-in app. It shows a feature exists in the shipped front-end. It does not prove the feature works well or is enabled for every customer.
- **[code]**: something seen in the JS logic itself (prices, URLs, vendor endpoints).

**Sources.** All are public URLs.
- Translation file, primary source: https://claimai.co.il/assets/i18n/heb.json (≈283 KB). The English mirror is https://claimai.co.il/assets/i18n/en.json.
- Landing component: https://claimai.co.il/chunk-TYOK2GGT.js
- Pricing component: https://claimai.co.il/chunk-UTXTPWKK.js and neighbouring chunks.
- Insurer directory: https://claimai.co.il/chunk-G2MBLH4F.js
- Claim types: https://claimai.co.il/chunk-WCQNNDPJ.js
- Demand-letter template: https://claimai.co.il/chunk-HJS5NY73.js
- Home: https://claimai.co.il/

---

## Who is the target customer, and what pitch leads?

### Takeaway
ClaimAI is a **back-office claims-pursuit tool for the claimant's side**. It mainly serves **garages (מוסכים)** and **insurance agencies (סוכנויות ביטוח)**, and also lists lawyers and insurers at sign-up. The lead pitch is "smart, simple, fast insurance-claims management, **all through integration with your email inbox**". The pain list is a garage or agency office chasing insurers: demand letters, finding the third party's insurer, nagging appraisers, insurer portals, and client updates.

### Cited Findings
- Hero text: "ניהול חכם פשוט ומהיר של **תביעות ביטוח** — והכל באמצעות התממשקות לתיבת הדוא"ל שלך", with the CTA "התחל ניסיון חינם". [site claim] — [heb.json LANDING.HERO](https://claimai.co.il/assets/i18n/heb.json)
- Registration asks "אתה:" with these options: חברת ביטוח / עורך דין / **מוסך** / **סוכנות ביטוח** / אחר. Choosing "מוסך" makes מספר מוסך, קוד מוסך, אימייל מוסך and חברת מוסך mandatory. [UI string] — [heb.json REGISTER.PROFESSIONAL, REGISTER.GARAGE_*](https://claimai.co.il/assets/i18n/heb.json)
- Upgrade pop-up: "התכונות מותאמות כעת לתחום העיסוק שלך — **מוסכים מקבלים גישה לתביעות הסדר מוסכים וסוכנויות ביטוח לתביעות סוכן**… ודאו… שפרטי ההתחברות לפורטלים נכונים". So there are two product modes, garage and agent. [UI string] — [heb.json PROFESSION_SETUP_POPUP](https://claimai.co.il/assets/i18n/heb.json)
- About page, founder story: "נעים להכיר, שמי **אייל סגל**. במשך שנים רבות אני חי ונושם את עולם **ניהול תביעות הרכב**". He lists these pains: מכתבי דרישה ידניים, רדיפה ואיתור חברות הביטוח של צד ג', תזכורות לשמאים, אין סוף מיילים לחברות הביטוח, פתיחה ידנית של תביעות בפורטלים, תזכורות לביצוע, עדכון לקוחות, שליחת מסמכים לחתימה. The product began as automations he built for his own office ("פיתחתי והטמעתי עבור עצמי… אוטומציות"). [site claim] — [heb.json LANDING.ABOUT_US](https://claimai.co.il/assets/i18n/heb.json)
- The About page also pitches office continuity: when you are sick or on vacation, work piles up. The product backs this with a "כיסוי תיקים" feature, where team members cover each other's cases during sickness or vacation. [site claim + UI string] — [heb.json LANDING.ABOUT_US.COST, COVERAGE](https://claimai.co.il/assets/i18n/heb.json)
- The internal admin analytics break users down by "התפלגות מקצועות" (bodyshop / agency / insurer / lawyer / other). There is also a dedicated "אנליטיקת מוסך" dashboard. [UI string] — [heb.json DASHBOARD](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- The founder appears to come from a **garage or claims-handling office** and pursues third-party ("צד ג'") property claims for vehicle repairs. The demand-letter template carries fields such as סכום תיקון, ירידת ערך, ימי עמידה and שכ"ט שמאי. This is the garage's money-collection workflow, the same buyer as our customer zero.
- The Tranzila payment terminal is named `segal3131` (see the technology section). This fits the product being run by Segal's own business, not a funded startup entity. Unverified.
- The end consumer is **not** the user. The consumer receives WhatsApp updates, answers a questionnaire, and signs consent forms.

### Gaps
- No legal company name, ח.פ. or Israeli address appears anywhere public. The ToS says only "החברה".
- No LinkedIn or press coverage turned up in web search. Searches return the unrelated ClaimzAI (bodily-injury insurtech). Market traction is unknown.

---

## What insurance lines are covered?

### Takeaway
The product covers **motor (vehicle) claims only**. Every field, document type and claim type is car-specific. The ToS speaks generically of "תביעות ביטוח", but nothing serves home, health, life, travel or business lines.

### Cited Findings
- Claim-type picklist: תאונה, גניבת רכב, רדיו טייפ, נזק אש, אי הגשה, הודעת זהירות, נזק עצמי, נזק עצמי ולצ"ג, נפגעי גוף, צד שלישי, תביעת חברה, דוח גלובאלי, נזקי טבע, **דוח פרטי**, נזקים לאחר גניבה, לידיעה בלבד, נזק בזדון, התפוצצות, שמשות, חליפי, אובדן להלכה, אובדן גמור, תיקון באחריות, תביעת הפסדים. All are motor categories. "נפגעי גוף" is the only bodily-injury entry. [code] — [chunk-WCQNNDPJ.js](https://claimai.co.il/chunk-WCQNNDPJ.js)
- The founder story frames the domain as "עולם ניהול תביעות הרכב" and "ענף תביעות הרכב". [site claim] — [heb.json LANDING.ABOUT_US](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- Line coverage matches ours (car accidents). Their claim-type taxonomy is much finer than our 4 tracks: it mirrors insurer/BAFI claim categories, not a triage model.

### Gaps
- No statement on whether "נפגעי גוף" gets any special flow.

---

## End-to-end flow: client interaction, data and documents collected, what the AI does

### Takeaway
ClaimAI is **email-centric and office-operated**. The office user opens a claim in the web app, or the AI creates or matches one from an incoming email with attachments. They attach documents, and the system:
- generates a **demand letter (מכתב דרישה)** and emails it from the user's own Gmail or Outlook to the insurer's claims address
- optionally **submits it into the insurer's portal** via RPA with OTP
- **finds the third party's insurer by plate number + date**
- nags appraisers
- messages the client on WhatsApp

Client-side interaction exists, but it is secondary:
- a WhatsApp "questionnaire" conversation that pre-fills an accident-notice form
- a tokenised e-signature page for consent forms
- voice dictation in the notice form

AI is applied to **reading documents** (classification and field extraction from email attachments). Per their own UI, photos are *not* read by the AI.

### Cited Findings
**Claimant interaction**
- In the WhatsApp chat inside the app, the user can press "**התחל שאלון**" ("התחל שיחת שאלון") with a client. [UI string] — [heb.json WHATSAPP.CHAT.START_QUESTIONNAIRE](https://claimai.co.il/assets/i18n/heb.json)
- The questionnaire feeds the notice form: "טוען מידע תביעה מהשאלון…", "הטופס מולא בנתונים מהשאלון", "השאלון בתהליך. חלק מהשדות עשויים להיות מלאים". [UI string] — [heb.json GENERATE_NOTIFICATION_FORM](https://claimai.co.il/assets/i18n/heb.json)
- Voice input on the notice form: "הקלט… מתמלל… לחץ להקלטת קול ומילוי אוטומטי של הטופס" (speech-to-text that auto-fills the form). [UI string] — same source
- Client e-signature page at route `signature/:token`: "חתימת מסמכים — עיין וחתום על מסמכי ההסכמה שלך… הורד מסמכים חתומים". The generated DOCX consent files are הסכמת_בעל_הרכב.docx, נספח_ד_הסכמת_הנהג.docx and הסכמה_למסירת_מידע.docx. [UI string + code] — [heb.json SIGNATURE_PAGE](https://claimai.co.il/assets/i18n/heb.json); [chunk-UTXTPWKK.js](https://claimai.co.il/chunk-UTXTPWKK.js)
- Automatic WhatsApp updates to the client throughout the claim ("עדכונים שוטפים מועברים ללקוח מתוך הוואטס אפ שלך"). [site claim] — [heb.json LANDING.SYSTEM_FEATURES / FAQ Q8](https://claimai.co.il/assets/i18n/heb.json)

**Data and documents collected.** These are the attachment categories in a case file. [UI string] — [heb.json ATTACHMENTS](https://claimai.co.il/assets/i18n/heb.json)
- Vehicle and scene: טופס הודעה, טופס Message, תצלום הפגיעה ברכב, תמונה של זירת האירוע, תמונות אירוע.
- Driver and vehicle documents:
  - own side: רישיון נהיגה, רישיון רכב (+ "צילום" variants)
  - third party: רישיון נהיגה / רישיון רכב / **תעודת ביטוח חובה של צד ג'** / תמונות נזק לרכב צד ג'
- Insurance and payment: אישור אי הגשה, אישור עבר ביטוחי, טופס הסכמה, צילום צ׳ק / אישור ניהול חשבון, הודעת תשלום, תשלום חלקי, מכתב דחייה, חשבונית תיקון, נלווה.
- Appraiser: **דוח שמאי**, **תמונות שמאי**.
- Clal agent claims need extra items: "הסכמת נהג לקבלת נתוני שאילתת נהיגה", "טופס הסכמה למסירת פרטים ממשרד הרישוי", "דוח שמאות כולל שכ"ט שמאי".

**Claim record fields**
- Core fields: חברה נתבעת, דוא"ל ביטוח, נושא, תאריך אירוע, שם מלא, טלפון, מספר רישוי, מספר תביעה, מספר רישוי צד שלישי, מוסך מתקן, CC, ספק דוא"ל.
- Financial fields: סכום תיקון נדרש, ירידת ערך, שכר טרחה, ימי עמידה, שכ"ט שמאי, סכום כולל, תאריך תשלום שיק.
- Flags: האם נזק טוטאלי, סטטוס תיקון (תוקן / לא תוקן), "האם תרצה שהמערכת תשלח תזכורות לשמאי", הקצה סוכן, שיחת וואטסאפ.
- [UI string] — [heb.json ADD_EDIT_CLAIM.FIELDS](https://claimai.co.il/assets/i18n/heb.json)

**Accident-notice form ("טופס הודעה")**
- The app has a built-in "**צור טופס הודעה** (במידה ואין לך אחד)".
- Sections: פרטי המבוטח והרכב, פרטי הנהג (שם, ת"ז, ת. לידה, טלפון, דוא"ל, שנת הוצאת רישיון), פרטי האירוע (תאריך, שעה, כתובת), תיאור האירוע, מיקום הנזק (חזית / שמאל / ימין / אחורי / גג / גחון), פרטי רכב ונהג מעורב.
- It also carries a consent line: "אני מאשר בזאת לחברת הביטוח לפצות את צד ג…".
- Claim type is a binary choice: פוליסה / צד ג'.
- The output is a **generic PDF titled "הודעה על תאונת דרכים", footed "מסמך זה הופק באמצעות מערכת claimai"**, generated with jsPDF.
- [UI string + code] — [heb.json GENERATE_NOTIFICATION_FORM](https://claimai.co.il/assets/i18n/heb.json); [chunk-UTXTPWKK.js](https://claimai.co.il/chunk-UTXTPWKK.js)

**What the AI does**
- Reads documents to draft demand letters: "המערכת קוראת את המסמכים שלך ומכינה באופן אוטומטי מכתבי דרישה מקצועיים בשמך". [site claim] — [heb.json LANDING.SYSTEM_FEATURES.ITEMS.LETTER](https://claimai.co.il/assets/i18n/heb.json)
- Demand-letter template [code] — [chunk-HJS5NY73.js](https://claimai.co.il/chunk-HJS5NY73.js)
  - Fields: לכבוד / הנדון: אירוע מיום… רכבנו… רכבכם / מספר רישוי / עמלות / ימי המתנה / "לטיפולכם לתשלום מלוא סכום הדרישה".
  - Attachments listed: טופס הודעה, אישור אי הגשה, דוח שמאי + תמונות, צילום המחאה, עבר ביטוחי.
  - Footer: "דרישה זו הופקה באמצעות תוכנת **claimi**, הדור החדש לניהול תביעות ביטוח".
- "Send to ClaimAI" from the inbox [UI string] — [heb.json INBOX_IMPORT](https://claimai.co.il/assets/i18n/heb.json)
  - "ה-AI קורא כל מסמך כדי לזהות את התביעה ואת סוג המסמך". It matches the email to an existing claim by thread, plate in subject, claim number, plate, third-party plate, policy number, insured name or incident date.
  - It shows "רמת הביטחון של ה-AI בסוג המסמך" and warns when another claim matches equally well.
  - When there is no match: create a new claim, or park the files in "מסמכים ממתינים".
  - "כל המסמכים הנדרשים קיימים: התביעה עברה לסטטוס ״מוכנה לשליחה״" (auto-promotes once the required documents are complete).
  - "**תמונות אינן נקראות על ידי ה-AI. הן מתווספות כתמונות שמאי.**" Logos and signature images are filtered out.
- Landing decoration mentions "ניתוח מסמכים", "**הערכת סיכונים**", "עיבוד אוטומטי" and "רשת נוירונים". These are animated marketing cards, not a documented feature. [site claim] — [heb.json LANDING.AI_CARD](https://claimai.co.il/assets/i18n/heb.json)

**Follow-ups and reminders**
- Automatic reminders to appraisers to deliver their reports on time ("תזכורות לשמאים"). There is an appraiser-management modal and a tutorial video, "שליחת תזכורות באופן אוטומטי לשמאי לשליחת דוח שמאות". [site claim + UI string] — [heb.json LANDING.SYSTEM_FEATURES / TUTORIALS](https://claimai.co.il/assets/i18n/heb.json)
- FAQ Q4: "התביעה נשלחה — מה כעת? **כלום**, המייל שלך מתנהל לבד מול הגופים הנתבעים לאורך כל הדרך". The user only checks the inbox for requests such as missing documents. [site claim] — [heb.json LANDING.FAQ](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- Their center of gravity is **after** information collection: pursuing, submitting and collecting money from the insurer. Ours is the claimant-facing collection plus notice-form fill. Overlap: both have a WhatsApp questionnaire and notice-form generation. They do have a client WhatsApp questionnaire, so our "WhatsApp intake" is **not unique**. Their intake looks like a side feature started by the office from inside the app, not the core flow.
- Their notice form is a **single generic ClaimAI-branded PDF**, not the insurer's own form overlaid at coordinates. Per-insurer official form filling is a real differentiator for us, if insurers require their own form.
- No evidence of photo damage assessment or OCR validation of license/registration quality. Their own UI says photos skip the AI.
- No evidence of an AI claim-track *classification* step. The user picks the type, binary פוליסה / צד ג' on the form, or from a long picklist.

### Gaps
- What the WhatsApp questionnaire actually asks, and whether it is AI-driven or a scripted bot. Only the button and prefill strings are visible.
- Which LLM, OCR or speech-to-text vendor is used. Nothing is named in the front-end; AI runs on the backend.

---

## Operator side: dashboard, CRM, statuses, team, integrations, exports

### Takeaway
The product is a full case-management web app:
- **Statuses:** a claims list with ~20 statuses
- **Analytics:** a BI dashboard (financial, time-to-resolution, unrepaired claims, garage analytics, alerts for claims open >30 days)
- **Mail and chat:** an embedded Gmail/Outlook inbox and a WhatsApp inbox (QR-linked device, or the AranBit official API)
- **Office tools:** team members with assignment and vacation cover, appointments calendar, Excel export
- **CRM sync:** a claimed CRM update ("most leading CRMs", none named)

### Cited Findings
- **Claim statuses** [UI string] — [heb.json CLAIMS.STATUS](https://claimai.co.il/assets/i18n/heb.json)
  - בטיפול, נשלחה-ממתין לעדכון, ממתין לשליחה (חסר מסמכים), מוכן לשליחה, התקבל דיווח, השלמת חוסרים, בקרת שמאי
  - התקבל הסדר, הסדר נדחה
  - ממתין לתשלום, תשלום חלקי, ערעור תשלום חלקי, שולמה
  - נדחתה, ערעור דחייה
  - טיפול משפטי (requires the lawyer's name and email)
  - לידיעה בלבד, נפתרו, הושלמו, סגורות
  - Separate repair status: תוקן / לא תוקן
- **Dashboard** [UI string] — [heb.json DASHBOARD](https://claimai.co.il/assets/i18n/heb.json)
  - ניתוח פיננסי, ניתוח זמן לפתרון (per user), ניתוח תביעות ללא תיקון, אנליטיקת מוסך, "התראות קריטיות — תביעות לא פתורות מעל 30 יום".
  - Landing claims "BI ואנליטיקה מתקדמים".
- **Email** [site claim + UI string] — [heb.json SETTING_PROVIDERS / LANDING.ABOUT.BENEFITS](https://claimai.co.il/assets/i18n/heb.json)
  - Connect Gmail (Google Workspace) or Outlook (Microsoft 365) via OAuth, with a default provider for sending.
  - Claims are emailed from the user's own mailbox. The inbox is browsable in-app (routes `gmail`, `outlook`, `email-providers`), and mail can be composed from a claim with case-file attachments.
- **WhatsApp** [UI string] — [heb.json WHATSAPP.PROVIDER / WHATSAPP.SCAN](https://claimai.co.il/assets/i18n/heb.json)
  - Option 1: "WhatsApp של המשרד (סריקת QR)… קישור הטלפון של המשרד כמכשיר מקושר. **מתאים לרוב הסוכנויות**". This is a WhatsApp Web linked-device connection, unofficial.
  - Option 2: "**דרך AranBit** (WhatsApp API רשמי)", using an API key from chat.aranbit.com.
  - Conversations can be opened or closed per claim; incoming messages on closed chats are ignored.
- **CRM:** "אנו יודעים לעדכן את התביעה במרבית תוכנות ה-crm המובילות". No CRM is named anywhere. Searches of the strings and code for סוכנט, Ezlink, Tafnit, Sapiens and BiZ returned nothing. [site claim] — [heb.json LANDING.FAQ Q7](https://claimai.co.il/assets/i18n/heb.json)
- **Team:** team members carry signature text and image; claims can be assigned to an agent. "כיסוי תיקים" grants colleagues full view/edit during absence, with changes logged under their own name. Account owners see all team cases. [UI string] — [heb.json TEAM_MEMBERS, COVERAGE, ASSIGN_MEMBER_DIALOG](https://claimai.co.il/assets/i18n/heb.json)
- **Other modules** (from the router, [code] — [main-WZBXTCC6.js](https://claimai.co.il/main-WZBXTCC6.js) and chunks):
  - `dashboard`, `claims`, `pending-documents`, `appointments` (calendar, available hours 08:00–19:00), `tutorials` (video guides), `whatsapp-notifications`, `users`, `requests`, `payment`, `2fa`, `unsubscribe`
  - "דוחות ביטוח" (insurance-reports library, searchable by insured or plate)
- **Export:** the ToS says data can be exported to Excel (field contents only, no attachments). ExcelJS and a DOCX library are bundled. [site claim + code] — [heb.json TERMS_OF_SERVICE.DATA.EXPORT](https://claimai.co.il/assets/i18n/heb.json)
- **Google Drive:** the Privacy Policy lists the Drive scope "files created by this app… used only for claim documents". Case-file storage appears to sit in the user's own Google Drive (drive.google.com preview/thumbnail URLs in code). [site claim + code] — [heb.json PRIVACY_POLICY.GOOGLE_DATA.SCOPE_DRIVE](https://claimai.co.il/assets/i18n/heb.json)
- **Security:** 2FA login exists (route `2fa`, `TWO_FA`, `SETTINGS_SECURITY`). [UI string] — [heb.json](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- The WhatsApp QR / linked-device mode implies an unofficial WhatsApp Web automation, typically via whatsapp-web.js or Baileys behind socket.io (socket.io is present in the bundle). That carries ban risk. AranBit is the compliant alternative.
- The status model is built around **getting paid** (הסדר, partial payment, appeals, legal). That is deeper than a "collection complete" dashboard.

### Gaps
- Which CRMs they actually integrate with. The claim is unspecific.
- Whether the dashboard is per-customer or only an admin view. Some analytics, such as profession distribution, are clearly admin-only.

---

## Insurer forms, submissions, and finding the third party's insurer

### Takeaway
This is ClaimAI's strongest area:
- **Portal submission (RPA):** claims are submitted into insurer portals with OTP:
  - third-party claims to ליברה, הפניקס, ביטוח ישיר
  - agent claims to איילון, מגדל, מנורה, שומרה, הפניקס, כלל
  - garage-settlement ("הסדר מוסך") requests to מגדל, מנורה, איילון, שומרה, הכשרה
  - the **BAFI** portal for search, create, submit and document download
- **Third-party lookup:** a "find the third party's insurer" button checks insurers by plate + date. It apparently scrapes each insurer's site; a Harel captcha failure is surfaced.
- **Email routing:** a built-in directory of claims email addresses for ~30 insurers, fleets and rental firms.
- **Forms:** they do **not** fill insurer-specific notice PDFs. They generate their own generic notice form.

### Cited Findings
- Portal statuses on the claim preview: [UI string] — [heb.json CLAIM_PREVIEW.*_STATUS](https://claimai.co.il/assets/i18n/heb.json)
  - "סטטוס תביעה צד שלישי — ליברה", "…צד שלישי — הפניקס", "…צד ג' — ביטוח ישיר", "סטטוס פורטל BAFI"
  - "הסדר מוסך" for מגדל / מנורה / איילון / שומרה / הכשרה
  - "תביעת סוכן" for איילון / מגדל / מנורה / שומרה / הפניקס / כלל
  - Each shows: not submitted / pending / success / already submitted / failed, plus claim ID, submitted-at, last attempt and "שלב שבו הופסק" (the step where it stopped), which fits RPA.
- OTP flows [UI string] — [heb.json *_OTP, BAFI_SEARCH](https://claimai.co.il/assets/i18n/heb.json)
  - LIBRA_OTP: phone + email → code → "שולח תביעה לליברה".
  - PHOENIX_OTP / CLAL_OTP ("אימות OTP לסוכן קלל… בחר את המוסך והשמאי שהוחזרו מקלל לפני שליחת התביעה").
  - DIRECT_OTP: "הזן את הקוד כדי להעלות את המסמכים אוטומטית", then a report of uploaded and missing documents.
  - BAFI_OTP / BAFI_SEARCH: "הוספת תביעה מבאפי… חיפוש בפורטל באפי לפי מספר רכב". If no claim is found, enter ת.ז./ח.פ and choose an agent to create one in the portal. Documents can be downloaded from BAFI.
- FAQ Q3: "המערכת שולחת את התביעה מתוך תיבת המייל של המשתמש **ובמקביל היא פותחת לבד את התביעה בפורטלים של חברות הביטוח**". [site claim] — [heb.json LANDING.FAQ](https://claimai.co.il/assets/i18n/heb.json)
- FAQ Q6 (garage settlement): "במקום שתיכנס לפורטלים ותמלא את הנדרש, המערכת עושה זאת עבורך". The generated request subject reads "בקשה לקבלת הסדר מוסכים — רכב … — אירוע מתאריך … — מוסך … — שמאי …". [site claim + code] — [heb.json LANDING.FAQ](https://claimai.co.il/assets/i18n/heb.json); [chunk-UTXTPWKK.js](https://claimai.co.il/chunk-UTXTPWKK.js)
- **Third-party insurer finder** [site claim + UI string] — [heb.json LANDING.FAQ Q2, CLAIMS.INSURANCE_CHECK](https://claimai.co.il/assets/i18n/heb.json)
  - "בלחיצה על כפתור, המערכת תאתר עבורך היכן צד ג' מבוטח — הבדיקה מבוצעת בהתאם למספר רישוי ותאריך אירוע. (**לא ניתן לבצע בדיקה לרכבי ליסינג**)".
  - The UI says "בודק חברות ביטוח…" and "הבדיקה **בהראל** נכשלה עקב קאפצ׳ה — נסה שוב".
- **Insurer list** (Hebrew picklist, 36 entries) [code] — [chunk-G2MBLH4F.js](https://claimai.co.il/chunk-G2MBLH4F.js)
  - Insurers and agencies: איי אי גי, איילון, ביטוח ישיר, הכשרה, הפניקס, הפניקס עדן, הראל, כלל, ליברה, מגדל, מנורה, שירביט, שלמה ביטוח, שומרה, ענבל, ווישור, קש, פרי, חקלאי, סקוריטס, משרד הביטחון.
  - Fleets and leasing: אגד, דן, אלבר, אלדן, אלקטרה, אופרייט, בלו סקאי, הרץ, יורו דרייב, פריסבי, שלמה סיקסט, קווים, אוויס, אנקור; plus "אחר".
- **Claims email directory** embedded in code. Examples: tviotrechev@fnx.co.il, zadg@fnx.co.il, tviot-r@clal-ins.co.il, mokedr@clal-ins.co.il, tviot_rechev@ayalon-ins.co.il, mokedel@migdal.co.il, t-prat@menora.co.il, scan@yashir.co.il, fax8109@harel-ins.co.il, tviotg@lbr.co.il, tvcar@hcsra.co.il, tvimokedg@shomera.co.il, claims@aig.co.il, claims@we-sure.co.il, tviot@kesh-ins.com, tviot@securitas.co.il, sherut@inbal.co.il, tviot-g@egged.co.il, tviot_pic@albar.co.il, moked.t@eldan.co.il, LEGALCLAIM@hertz.co.il, tviot@avis.co.il, claims@eurodrive.co.il, Claims4u@freesbe.com. [code] — [ClaimAI JS bundle](https://claimai.co.il/chunk-G2MBLH4F.js); found by grep across all chunks.

### Inferences
- Portal RPA plus the third-party insurer lookup is a **hard-to-copy moat**. Each portal integration is brittle, needs OTP and needs maintenance, but it is exactly the "פתיחה ידנית בפורטלים" pain. Our product today stops at the notice-form PDF and case file. For a garage, ClaimAI goes further down the funnel: settlement request, submission, payment tracking.
- The split between "agent claims" and "third-party claims" shows they serve the *agency* use case: filing on the agent's own insurer portal (תביעת סוכן) for own-policy claims, plus the third-party demand flow. This overlaps directly with our `own_policy` / `third_party_*` tracks.

### Gaps
- Whether each portal flow is live and reliable. The strings only prove the UI exists.
- Whether "find the insurer" uses an official source (e.g. the Pool / משרד התחבורה) or scrapes insurer sites one by one. The Harel captcha suggests per-insurer scraping.

---

## Pricing model, price points, trial

### Takeaway
**Per-claim pricing plus a monthly system fee**, ex-VAT. These numbers come from the hard-coded plan objects in the payment page JS, not from a public pricing page. There is a free trial that starts on the first request. Its length is not visible.

### Cited Findings
- Plans hard-coded in the payment component [code] — [ClaimAI payment chunk](https://claimai.co.il/chunk-UTXTPWKK.js); labels in [heb.json PAYMENT](https://claimai.co.il/assets/i18n/heb.json)
  - **"תוכנית פרימיום" (monthly_subscription, flagged popular):** `initialPrice:1490` for a package of 10 claims (`claimsIncluded:10`, `claimPrice:149`), `recurringPrice:100` for 12 months ("תחזוקת מערכת"), `systemFee:90`.
  - **"תוכנית תמיכה מלאה" (support_plan):** "**אנו נטפל עבורך בתביעה** — ₪400 לתביעה אחת" (`initialPrice:420`, `claimPrice:400`), no monthly fee. This is a done-for-you claims-handling service.
  - **"תשלום תביעה בודדת" (single_case, add-on):** `initialPrice:199`, with `systemFee:90`. It drops to **₪125** for active monthly subscribers.
  - **"10 תביעות נוספות" add-on:** `initialPrice:1490`.
  - "המחירים לא כוללים מע"מ כחוק".
  - A leftover string reads "תשלום עבור רכישת 10 תביעות — 1000 שח" (possibly an older price point, undated).
- Admin "plans" table: columns are "מכסת תיקים חודשית" (monthly case quota) and "תשלום חודשי". The pricing unit is **cases per month**. [UI string] — [heb.json PLANS](https://claimai.co.il/assets/i18n/heb.json)
- Free trial: "תקופת הניסיון תתחיל כאשר תבצע את הבקשה הראשונה שלך", with a trial end date and an "שדרג עכשיו" button. The landing CTA reads "התחל ניסיון חינם". [UI string] — [heb.json FREE_TRIAL](https://claimai.co.il/assets/i18n/heb.json)
- ToS: licence "תמורת תשלום חודשי"; price changes need 14 days' notice. [site claim] — [heb.json TERMS_OF_SERVICE](https://claimai.co.il/assets/i18n/heb.json)
- Payment processor: **Tranzila** iframe (`https://direct.tranzila.com/segal3131/iframenew.php`). [code] — [ClaimAI JS bundle](https://claimai.co.il/chunk-UTXTPWKK.js)

### Inferences
- The effective price is about **₪125–₪199 per claim + ~₪90–100/month**, or **₪400 per claim fully outsourced**. This is a useful anchor for our own garage pricing conversation: they price per *case*, not per seat.
- The ₪400 "we'll handle it for you" plan shows they also sell a **service** (a human claims handler), consistent with a founder who runs a claims office.

### Gaps
- Trial length is not visible: computed server-side from `freeTrialEndDate`.
- No public pricing page exists; numbers are only in post-login payment code and may differ per customer.

---

## Technology fingerprint, legal entity, privacy/security

### Takeaway
The front-end is **Angular** (standalone/esbuild chunks, Material + Tailwind, Lottie, GSAP, Quill, jsPDF, docx, ExcelJS, socket.io) on **Netlify**. The backend API is at **`claimi.pascalweb.com`** (Node/Express behind Caddy), hosted under **Pascalweb SARL**, an outsourced web/AI dev shop. A second subdomain, `fnx.pascalweb.com`, probably handles Phoenix ("FNX") integration. Analytics are limited to a Meta Pixel; no AI vendor is named. The legal pages are generic: no company name, ח.פ., data location or sub-processor list. There are no ISO or security certifications and no accessibility statement.

### Cited Findings
- `server: Netlify`; `cache-status: "Netlify Edge"`; www redirects 301 to the apex; HSTS is set. robots.txt and sitemap.xml are absent: the SPA fallback returns index.html. [verified] — [claimai.co.il](https://claimai.co.il/)
- HTML: `<title>Claimai</title>`, `data-beasties-container` (Angular critical-CSS inliner), `<app-root>`, hashed chunks `main-WZBXTCC6.js` / `chunk-*.js`, Google site verification, **Meta Pixel ID 2060889828004520**. No GA, GTM, Hotjar or Clarity tag in the HTML. [verified] — [claimai.co.il](https://claimai.co.il/)
- JS references `https://claimi.pascalweb.com/api` (backend) and `https://fnx.pascalweb.com`. Response headers: `via: 1.1 Caddy` and, on fnx, `x-powered-by: Express`. pascalweb.com is on Vercel. [verified] — [ClaimAI main bundle](https://claimai.co.il/main-WZBXTCC6.js)
- pascalweb.com's title: "**Pascalweb SARL** — web development, mobile applications, automation, artificial intelligence — Solutions Digitales". [verified] — [pascalweb.com](https://www.pascalweb.com/)
- Other endpoints in code: geolocation-db.com, Google OAuth userinfo, Gmail logo assets, Drive preview, a pdfobject CDN, and a Crisp reference (string only). No anthropic, openai, claude or gpt strings in the front-end. [verified] — [ClaimAI JS bundle](https://claimai.co.il/main-WZBXTCC6.js)
- The product name is inconsistent: "claimai" (site and notice-form footer) versus "**claimi**" (demand-letter footer and backend host). [verified] — [ClaimAI demand-letter chunk](https://claimai.co.il/chunk-HJS5NY73.js)
- Privacy Policy [site claim] — [heb.json PRIVACY_POLICY](https://claimai.co.il/assets/i18n/heb.json)
  - Gmail and Outlook access is used to send claim emails and to display the inbox. Fetched mail is "not stored on our servers"; sent mail is stored in the case file.
  - It follows Google API Limited Use.
  - "איננו מעבירים נתוני משתמש של Google לשום שירות צד שלישי של בינה מלאכותית… תכונות הבינה המלאכותית שלנו פועלות רק על מסמכים והודעות שאתה מספק ישירות ל-Claimai". This implies documents users send in **are** processed by AI, which may be a third-party service. No vendor is named.
  - Third-party services are mentioned only generically. There is no data-location statement.
- ToS ("הסכם רישיון שימוש בתוכנת claimai") [site claim] — [heb.json TERMS_OF_SERVICE](https://claimai.co.il/assets/i18n/heb.json)
  - Israeli law, with exclusive jurisdiction in Tel Aviv-Yafo courts.
  - Data is stored in a "ענן" of third-party providers.
  - Users must be 18+. Joining implies consent to direct marketing under חוק הגנת הפרטיות.
  - The software is provided "As Is", with liability capped at the cost of the software.
  - The legal entity is never named; it appears only as "החברה".
- Footer placeholder content is still live in the translations: phone "+1 (555) 123-4567", address "123 רחוב העסק, סוויטה 100, ניו יורק, NY 10001, ארצות הברית". The footer description talks about "המאחדת Gmail ו-Outlook בדשבורד חכם אחד", which looks like template copy. [verified as present in the file; whether it renders is unverified] — [heb.json LANDING.FOOTER](https://claimai.co.il/assets/i18n/heb.json)
- No accessibility statement: zero matches for "נגישות" or "accessib". [verified] — [heb.json](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- The product looks built by a small outsourced dev shop (possibly French-speaking, given "SARL") for an Israeli founder. The template leftovers (US placeholder address, "שautomatizמות" typo in the features subtitle) suggest an immature marketing site, even though the app surface is large.
- The lack of a named legal entity, sub-processor list or accessibility statement is a compliance gap. An Israeli business handling ID and license PII would normally need these under חוק הגנת הפרטיות and תקנות אבטחת מידע. It is a possible talking point.

### Gaps
- DNS/WHOIS: `dig` was unavailable in this sandbox and app.claimai.co.il was refused by the proxy. Registrar, MX (mail provider) and creation date are unverified.
- Wayback Machine: web.archive.org was unreachable (connection reset; WebFetch blocked). The availability API returned **no snapshots**. Launch date and pitch history are unknown. The copyright line reads "© 2026 Claimai".
- No customer logos, testimonials or case numbers anywhere (see next section).

---

## Customer logos, testimonials, metrics claimed

### Takeaway
The site shows **no customer logos, testimonials or named customers**. The only metrics are three unsourced stat tiles: **500%** productivity increase, **99.9%** uptime, **24/7** support.

### Cited Findings
- Hard-coded stat tiles in the landing template: "500%" next to "עלייה בפרודוקטיביות — שיפור ממוצע שדווח על ידי המשתמשים שלנו", "99.9%" next to "זמינות מערכת", and "24/7" next to "תמיכה". [code] — [chunk-TYOK2GGT.js](https://claimai.co.il/chunk-TYOK2GGT.js); labels in [heb.json LANDING.ABOUT.STATS](https://claimai.co.il/assets/i18n/heb.json)
- The "24/7 support" claim contradicts the ToS, which defines customer service as "ימים א'-ה' ובימי שישי וערבי חג בשעות העבודה המקובלות". [site claim vs site claim] — [heb.json TERMS_OF_SERVICE.DEFINITIONS.CUSTOMER_SERVICE](https://claimai.co.il/assets/i18n/heb.json)
- The only social proof is the founder's personal story. [site claim] — [heb.json LANDING.ABOUT_US](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- The "500%" figure is marketing with no stated base, so do not quote it as a benchmark.

### Gaps
- Number of customers and claims processed: not disclosed anywhere public.

---

## Language / RTL, mobile, accessibility

### Takeaway
The UI is Hebrew-first and RTL (`"dir":"rtl"` in heb.json), with full English, Arabic and Russian translations. It is a responsive web app; there is no native mobile app and no accessibility statement.

### Cited Findings
- Translation files: heb.json (`dir: rtl`), en.json (`dir: ltr`), ar.json and ru.json, each 240–360 KB and complete. The language picker shows "עברית". Noto Sans Hebrew is loaded. [verified] — [heb.json](https://claimai.co.il/assets/i18n/heb.json), [en.json](https://claimai.co.il/assets/i18n/en.json)
- Viewport meta tag present; Tailwind responsive classes; no app-store links found. [verified] — [claimai.co.il](https://claimai.co.il/)
- No accessibility statement (see the technology section). [verified]

### Inferences
- The Arabic and Russian translations target Israel's Arabic- and Russian-speaking garage and agency staff. That is a localization edge over a Hebrew-only product.

### Gaps
- Real mobile usability was not tested: it needs a login.

---

### Comparison cheat-sheet (for the report writer)

| Capability | ClaimAI (evidence level) | Us |
|---|---|---|
| Client WhatsApp intake questionnaire | Yes, started by the office user from the app chat; prefills the notice form (UI string) | Core flow |
| Client e-signature of consent forms | Yes (UI string + code) | — |
| Voice dictation into the notice form | Yes (UI string) | — |
| AI reads incoming email documents, matches to claim, classifies doc type, auto-promotes to "ready to send" | Yes (UI string) | Partly (spec in ai-doc-validation.md, not built) |
| AI analyzes car photos | **No**: "photos are not read by the AI" (UI string) | — |
| Claim-track classification by AI | Not evidenced; manual picklist / פוליסה-צד ג' | AI proposes, agent confirms |
| Accident-notice form | Generic ClaimAI-branded PDF (code) | Per-insurer official PDF overlay |
| Demand letter (מכתב דרישה) auto-generated | Yes, core (site + code) | — |
| Send claim from user's Gmail/Outlook | Yes, core (site + UI) | — |
| Insurer portal submission (RPA + OTP) | Libra, Phoenix, Direct, Clal, Ayalon, Migdal, Menora, Shomera, Hachshara, BAFI (UI string) | — |
| Garage-settlement (הסדר מוסך) requests | Yes, via portals (site + UI) | — |
| Find the third party's insurer by plate + date | Yes, except leasing cars (site + UI) | — |
| Appraiser reminders | Yes (site + UI) | — |
| Payment / appeal / legal status tracking | Yes, ~20 statuses (UI) | Simpler state machine |
| CRM sync | Claimed, no CRM named (site) | — |
| Pricing | ₪125–199/claim + ₪90–100/month; ₪400/claim done-for-you (code) | TBD |
