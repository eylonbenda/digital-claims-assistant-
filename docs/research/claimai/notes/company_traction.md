# ClaimAI (claimai.co.il): company identity, team, funding, traction, go-to-market

Research date: 2026-10-16. Method note: claimai.co.il is a client-rendered Angular single-page app hosted on Netlify. Plain fetchers and search engines see only the title "Claimai". Most primary evidence here therefore comes from the site's **own public files**: its HTML, JS bundles, and the i18n translation files `https://claimai.co.il/assets/i18n/heb.json` and `https://claimai.co.il/assets/i18n/en.json`. These are the strings the live site renders on the landing, about, terms, privacy and pricing pages. All of it was fetched 2026-10-16 with no login. Web search (Hebrew and English) returned **no third-party coverage at all** for ClaimAI. That absence is itself a finding.

## 1. Corporate identity (legal entity, ח.פ., incorporation, address)

### Takeaway
The site names **no legal entity, no ח.פ. and no real address**. The terms of service refer only to "החברה". The footer and contact blocks still hold template placeholder data (a New York address and a +1-555 phone number). The only real contact point is a personal Gmail, `eyaltvcar@gmail.com`. The product earlier carried the name **"claimi"**.

### Cited Findings
- The terms of service define the parties only as "החברה". The site is described as "אתר האינטרנט המצוי בבעלות החברה הנושא את הכתובת www.claimai.co.il". The software is described as "תוכנת claimai… אשר פותחה ע"י החברה ומהווה כלי עזר דיגיטלי לניהול תביעות ביטוח". No company name or ח.פ. appears anywhere in the Hebrew or English i18n files (checked 2026-10-16). — [heb.json](https://claimai.co.il/assets/i18n/heb.json)
- The footer and contact page hold template placeholders: "123 רחוב העסק, סוויטה 100, ניו יורק, NY 10001, ארצות הברית", phone "+1 (555) 123-4567", support email "support@yourcompany.com". The footer description reads "פשטו את ניהול הדואר שלכם… המאחדת Gmail ו-Outlook", which is leftover generic copy. The footer says "© 2026 Claimai. כל הזכויות שמורות." — [heb.json](https://claimai.co.il/assets/i18n/heb.json)
- The privacy and legal page code hard-codes `mailto:eyaltvcar@gmail.com` as the contact address. — [main/chunk JS bundle on claimai.co.il](https://claimai.co.il/)
- The site takes payments through a Tranzila terminal named **`segal3131`** (`https://direct.tranzila.com/segal3131/iframenew.php`). — [claimai.co.il JS bundle](https://claimai.co.il/)
- Generated demand letters carry the footer "דרישה זו הופקה באמצעות תוכנת **claimi**, הדור החדש לניהול תביעות ביטוח". Accident-notice PDFs say "מסמך זה הופק באמצעות מערכת claimai". The backend API host is `claimi.pascalweb.com`. — [claimai.co.il JS bundle](https://claimai.co.il/)
- The letter template includes a "מ.ע.מ: ${taxID}" field filled from each *user's* profile. This is the customer's business number, not ClaimAI's. — [claimai.co.il JS bundle](https://claimai.co.il/)
- Hosting: Netlify (response header `server: Netlify`, 2026-10-16). The page has Google Search Console verification and a Meta pixel, id `2060889828004520`. — [claimai.co.il](https://claimai.co.il/)
- Wayback Machine holds a capture dated **2026-02-26** (`web.archive.org/web/20260226170917/https://claimai.co.il/`). The CDX listing for the first capture date failed through the proxy, so the launch date is unconfirmed. — [archive.org availability API](http://archive.org/wayback/available?url=claimai.co.il)

### Inferences
- The billing terminal `segal3131`, the Gmail handle `eyaltvcar` ("Eyal תביעות רכב") and the founder's self-introduction (section 2) point to a small business run by **אייל סגל**. It may be an עוסק or a small בע"מ; no registry record confirms either.
- The placeholder contact data, the leftover email-client footer copy and the absence of a legal entity in the terms suggest the site was assembled quickly from a template. This looks like a very early, founder-led product, not a funded startup.
- "claimi" is probably the earlier or internal name. The rename to "claimai" happened before the Feb-2026 capture; the exact date is unknown.

### Gaps
- **ח.פ., legal name, incorporation date and registered address were not found.** ISOC WHOIS (isoc.org.il) sits behind a Cloudflare JS challenge, and `.co.il` WHOIS hides private registrants anyway. No `whois` CLI was available. checkid, ICA, opencorporates, bdi and duns were not reachable with a usable name to search.
- The first Wayback capture date (site launch) could not be retrieved.

## 2. Founders and team

### Takeaway
The site's "הסיפור שלנו" section names a single founder, **אייל סגל**. He says he spent "many years" working in motor-claims handling himself, built automations for his own work, then turned them into claimai. Development appears to be **outsourced to Pascalweb SARL, a web/AI agency in Casablanca, Morocco**. No team page, LinkedIn page or headcount was found.

### Cited Findings
- About-us text: "נעים להכיר, שמי אייל סגל. במשך שנים רבות אני חי ונושם את עולם ניהול תביעות הרכב… מצאנו את עצמנו, כמו רוב העוסקים בתחום, משקיעים שעות יקרות…". He lists his old pains: manual demand letters, tracking down third-party insurers, appraiser reminders, endless insurer emails, opening claims by hand in portals, client updates, documents for signature. — [heb.json, LANDING.ABOUT_US](https://claimai.co.il/assets/i18n/heb.json)
- Origin story: "נקודת המפנה: יום שישי אחד בצהריים… פיתחתי והטמעתי עבור עצמי פתרונות ואוטומציות נקודתיות… הבעיה שפתרתי היא בעיה כואבת… של ענף שלם. זה היה הרגע שבו נולדה claimai." The stated ambition is to serve "כלל העוסקים בתחום, בארץ ובעולם כולו". — [heb.json](https://claimai.co.il/assets/i18n/heb.json)
- The production backend runs on subdomains of pascalweb.com: `apiURL: https://claimi.pascalweb.com/api`, `wsURL: https://claimi.pascalweb.com`, `proxyURL: https://fnx.pascalweb.com`. Both hosts answered on 2026-10-16: a NestJS-style 404 JSON and "Hello World!". — [claimai.co.il JS environment config](https://claimai.co.il/)
- pascalweb.com describes itself as "Pascalweb SARL | Création de Solutions Digitales : Développement Web, Applications Mobiles, Automatisation, Intelligence Artificielle… assistants et agents IA". Its contact details are `business@pascalweb.com` and **+212 6 34 42 31 13** (Moroccan code), and its portfolio includes "AREP-Casablanca-Settat". — [pascalweb.com](https://pascalweb.com/)
- **Name collision:** a search for "אייל סגל" returns a different, well-known Eyal Segal, the former owner of מכבי נתניה, in coverage of a ~9.5M ₪ arbitration claim against him. Nothing links him to claimai. Do not conflate the two. — [ynet](https://www.ynet.co.il/sport/israelisoccer/article/skut5gqszl), [Walla](https://sports.walla.co.il/item/3871892)
- An English search for "Eyal Segal" plus insurance claims in Israel found no matching LinkedIn profile. — [search, 2026-10-16](https://il.linkedin.com/in/yael-assraf) (unrelated results only)

### Inferences
- The founder is a **domain operator, not a technologist**. The "we" language and the pain list (demand letters to the third-party insurer, appraiser chasing, הסדר מוסכים portals) fit someone running a motor-claims handling office: a third-party claims office, an agency claims desk, or a garage's claims function. Domain-specific code (a directory of insurer and fleet claims emails, portal automations) supports this.
- The product is likely **built by a contracted Moroccan dev shop** (Pascalweb hosts it under its own domain). The founder may own the product commercially while the agency holds the technical capability. That makes it a one-founder-plus-agency operation, not a tech startup with an in-house team. This is inference from hosting, not a confirmed contract.
- Headcount is probably 1 to a few people on the Israeli side.

### Gaps
- No LinkedIn company page, founder LinkedIn, team page or headcount was found.
- The founder's exact prior business (agency, garage or claims office) and its name are unknown.

## 3. Funding, accelerators, grants

### Takeaway
**No evidence of any funding, accelerator or grant.** Everything observed points to a bootstrapped, founder-funded product.

### Cited Findings
- Hebrew and English searches for "ClaimAI", "claimai.co.il", "קליימאי" and related terms returned no press, no funding announcement and no accelerator listing. Results surfaced only unrelated companies (see section 6). — [search: ClaimAI תביעות ביטוח סוכנים](https://fintech.global/2026/05/14/insurtech-firm-insured-io-launches-ai-claims-agent/); [search: "claimai.co.il"](https://techindex.law.stanford.edu/companies/claimzai)
- The site shows no investor logos, "backed by" text or program badges (checked across all i18n landing strings, 2026-10-16). — [heb.json](https://claimai.co.il/assets/i18n/heb.json)

### Inferences
- Bootstrapped. Outsourced development and personal-Gmail contact both fit self-funding.

### Gaps
- רשות החדשנות, Insurtech Israel, The Floor, Fintech-Aviv and Microsoft/Google for Startups participation were not checked directly in their databases. Nothing surfaced in general search.

## 4. Traction (customers, users, partnerships, press, events)

### Takeaway
**No named customers, no user or claim counts, no partnerships and no press coverage were found.** The product, however, ships deep, working-looking automations against Israeli insurer portals. That implies real usage by at least the founder's own office and probably a handful of garages and agencies.

### Cited Findings
- The landing page shows "stats" labels (productivity increase, uptime, support) but no testimonials, customer logos or numbers in the copy. The values are not in the i18n file. — [heb.json, LANDING.ABOUT.STATS](https://claimai.co.il/assets/i18n/heb.json)
- Target segments at registration ("אתה:"): **סוכנות ביטוח, מוסך, עורך דין, חברת ביטוח, אחר**. — [heb.json, REGISTER.PROFESSIONAL](https://claimai.co.il/assets/i18n/heb.json)
- A product-upgrade popup reads: "We've upgraded the system! Features are now tailored to your profession — body shops get access to Garage Settlement claims and insurance agencies to Agent claims. Please make sure your profession and portal credentials are up to date…". This addresses existing users, so there is an installed base. — [en.json, PROFESSION_SETUP_POPUP](https://claimai.co.il/assets/i18n/en.json)
- The admin dashboard tracks "Days Since Registration", "Profession distribution" and a "Free Trial" user status. — [en.json, DASHBOARD.USER_ANALYTICS](https://claimai.co.il/assets/i18n/en.json)
- Insurer integrations are robotic or portal-based, not partnerships. Garage-settlement (הסדר מוסכים) submission flows exist for **הפניקס, מגדל, מנורה, איילון, שומרה, הכשרה (HCSRA)**. OTP-based portal logins exist for **ליברה, הפניקס, כלל, ביטוח ישיר, "BAFI"**. A proxy host is named `fnx.pascalweb.com` (fnx = הפניקס). — [en.json, CLAIM_PREVIEW.GARAGE_SETTLEMENT_PORTAL / *_OTP](https://claimai.co.il/assets/i18n/en.json)
- The bundle carries a built-in directory of ~45 Israeli insurers and fleet/leasing claimants with claims-desk emails: insurers (הראל, מגדל, כלל, הפניקס, מנורה, איילון, הכשרה, שומרה, ביטוח ישיר, AIG, ליברה, ווישור, שירביט, שלמה) and fleets (הרץ, אוויס, אלבר, אלדן, שלמה סיקסט, אגד, דן, קווים, משרד הביטחון, Freesbe and others). — [claimai.co.il JS bundle](https://claimai.co.il/)
- Third-party integrations: Gmail and Outlook OAuth (email-native workflow), WhatsApp through a provider called "AranBit", and claimed CRM sync ("אנו יודעים לעדכן את התביעה במרבית תוכנות ה crm המובילות"). — [heb.json, FAQ Q7; en.json, WHATSAPP.PROVIDER](https://claimai.co.il/assets/i18n/heb.json)
- No coverage was found in TheMarker, Calcalist, Globes, Geektime, Ice, Bizportal, Polisa or other insurance-trade sites (searches 2026-10-16). Trade press does cover unrelated ClaimzAI. — [polisa.news on ClaimzAI](https://polisa.news/?p=119124)

### Inferences
- Portal automations for 6+ insurers, a profession-split upgrade and user-analytics screens suggest a **live product with paying or trial users**, likely in the tens, not thousands. That number is a guess with no data behind it.
- **Garages (הסדר מוסכים) and agencies are both core segments**, the same two segments the Digital Claims Assistant targets. The garage-settlement portal automation is a capability the competing startup lacks today.
- The insurer integrations are **unofficial portal automation** (OTP relay, scraping garage and appraiser lists). They are not sanctioned APIs, so they are fragile and carry ToS risk, but they are a real switching-cost moat if they keep working.

### Gaps
- Customer names, user counts, claim volumes and revenue were not found.
- No conferences or events were found (e.g., כנס לשכת סוכני ביטוח, insurtech meetups).
- No partnerships with לשכת סוכני ביטוח or agency-management software vendors were found.

## 5. Go-to-market (pricing, channels, social, ads)

### Takeaway
The product is sold **self-serve with a free trial and Tranzila card payment**, priced per claim (about 100 ₪ per claim in a 10-claim pack) plus a monthly maintenance fee, with a managed "we handle the claim" tier. A Meta pixel suggests paid social acquisition. No social pages or follower counts could be verified.

### Cited Findings
- Pricing copy: "תשלום עבור רכישת 10 תביעות - 1000 שח"; "תשלום מראש בגין רכישת חבילה של {{claimsIncluded}} תביעות"; "כולל תשלום חודשי עבור תחזוקת מערכת"; "תוכנית פרימיום"; a single-claim option ("תשלום עבור רכישת תביעה בודדת… תשלום חד פעמי לכל תביעה"); and "תוכנית תמיכה מלאה — אנו נטפל עבורך בתביעה - ₪{{claimPrice}} לתביעה אחת… ללא תשלום דמי שימוש חודשיים". Prices are excl. VAT. Live plan values load from an authenticated API (`/api/plans` returns 401). — [heb.json, PAYMENT](https://claimai.co.il/assets/i18n/heb.json)
- Free trial: "תקופת הניסיון תתחיל כאשר תבצע את הבקשה הראשונה שלך"; hero CTA "התחל ניסיון חינם". — [heb.json, FREE_TRIAL / LANDING.HERO](https://claimai.co.il/assets/i18n/heb.json)
- Hero positioning: "ניהול חכם פשוט ומהיר של תביעות ביטוח — והכל באמצעות התממשקות לתיבת הדוא"ל שלך." Listed features: automatic demand letters, third-party insurer lookup by plate number and date, appraiser reminders, automatic portal claim opening, garage-agreement requests, WhatsApp client updates, CRM sync, BI. — [heb.json, LANDING.SYSTEM_FEATURES](https://claimai.co.il/assets/i18n/heb.json)
- The app has an in-app "tutorials" section (video tutorials, e.g., "Appraiser Reminder System") and a "schedule meeting" banner. — [en.json, TUTORIALS / SCHEDULE_MEETING_BANNER](https://claimai.co.il/assets/i18n/en.json)
- A Meta (Facebook) pixel, id 2060889828004520, fires PageView on the landing page. — [claimai.co.il HTML](https://claimai.co.il/)
- A search for a ClaimAI Facebook page or agent-group posts found nothing, only unrelated job ads. — [search results, 2026-10-16](https://www.alljobs.co.il/m/p/jobs/8709405)

### Inferences
- Unit economics are pitched as **~100 ₪/claim plus maintenance**, which anchors the market's per-claim price for small offices. Directly relevant to the competing startup's pricing conversation.
- The "we handle it for you" tier suggests the founder's own claims office doubles as a **service bureau**, mixing software and outsourced claims handling.
- The Meta pixel implies at least intent to run or retarget Facebook/Instagram ads, plausibly into garage-owner and agent audiences.

### Gaps
- **Meta Ad Library was not checked.** It needs an interactive JS session, so active ads and their creative are unverified.
- No Facebook, Instagram, LinkedIn, TikTok or YouTube accounts were found, so there are no follower counts. The site links to none.
- No reviews were found.

## 6. Other competitors and name collisions found during search

### Takeaway
"ClaimAI" collides with several unrelated products. The closest Israeli namesake, **ClaimzAI**, is a different company: insurer-side bodily-injury analytics. No other Israeli AI claims assistant aimed at agents or garages surfaced.

### Cited Findings
- **ClaimzAI** (claimzai.com), Tel Aviv, founded 2020. It offers court-data-driven decision support for חובה and bodily-injury claims, sold to insurers. In April 2024 it launched a medical-expert-opinion analysis module "already used by several Israeli insurers". It is insurer-side, so it does not compete directly. — [claimzai.com](https://www.claimzai.com/), [Polisa](https://polisa.news/?p=119124), [Stanford CodeX techindex](https://techindex.law.stanford.edu/companies/claimzai)
- **ג'יני (gini-ins.co.il)**: an Israeli digital insurance agency using AI for comparison, claims and renewals. It is a B2C agency, not a B2B tool. — [gini-ins.co.il](https://gini-ins.co.il/)
- Unrelated global name collisions: **insured.io "Claims AI"** (US FNOL voice/chat agent, May 2026) — [fintech.global](https://fintech.global/2026/05/14/insurtech-firm-insured-io-launches-ai-claims-agent/); **IBM "Claims-AI"** on AWS/Azure marketplaces — [Microsoft Marketplace](https://marketplace.microsoft.com/de-de/product/ibm-alliance-usa-ny-armonk-dtt-6418595.ibm-claims-ai); **Claimable** (US health-denial appeals) — [Crunchbase](https://www.crunchbase.com/organization/claimable-c41a); **Five Sigma** (AI claims management for carriers) — mentioned in [search results](https://kennedyslaw.com/where-we-are/emea/israel).

### Inferences
- Among public results, claimai.co.il looks like the only Israeli B2B tool squarely aimed at **garages and agents for third-party and הסדר claims**. That makes it the direct competitor, despite having no market visibility.

### Gaps
- No systematic scan was done of Israeli agency-management vendors (e.g., Surense, Smart Agent, Bafi) for claims modules. "BAFI" appears in claimai's OTP integrations; what it refers to is unconfirmed.
