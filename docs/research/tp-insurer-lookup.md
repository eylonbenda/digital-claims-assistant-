# Third-party insurer lookup by plate number — research

> **Research doc, 2026-10-25.** Question: can we determine, from an Israeli license-plate number, which insurer covers the vehicle (חובה / מקיף) — the "בדוק" feature ClaimAI has (see `docs/competitor-claimai.md`)? Today the agent traces this by hand (task `get_tp_insurer`); a lookup would prefill the canonical insurer select in the prepare-submission panel (`web/src/lib/submission/`, persisted to `claims.at_fault_insurer`).

## Bottom line

**There is no public, API-accessible registry mapping plate → insurer in Israel.** What exists:

| Route | Plate query? | Open to us? | Covers |
|---|---|---|---|
| הר הביטוח (harb.cma.gov.il) | No — identified-person only | No (gov-SSO, own portfolio only) | — |
| קרנית "איתור מבטח לרכב" | Yes (plate + accident date, paid) | Legally doubtful for a garage | חובה only |
| מרכז הסליקה / infocar.co.il | Yes, owner-consent only | No (owner / insurers only) | רכב רכוש history |
| data.gov.il | — | n/a | No insurance data at all |
| **Per-insurer public cover-check pages** | Yes (plate + event date → y/n per insurer) | **Yes — offered openly for third parties** | חובה/צד ג' per insurer |

The market-proven route — the one ClaimAI's input signature matches and that savetime.co.il openly clones — is **fanning out across insurers' own public coverage-check pages**. That is the recommended first path.

Raw findings with per-claim source URLs are summarized per track below; "unverified" flags are explicit.

## Track 1 — הר הביטוח (Har HaBituach)

- **What it is:** the regulator's (רשות שוק ההון) free portal at `harb.cma.gov.il` aggregating the *logged-in person's own* policies across all insurers, plus a consolidated 3-year עבר ביטוחי (claims history) report for רכב רכוש. (Read live 2026-10-25; plain `curl` is WAF-blocked.)
- **Auth:** exclusively מערכת ההזדהות הממשלתית (government SSO, ת"ז-bound). A separate "כניסת מורשים" entrance exists for insurers/agents, who per a 2016 CMA circular may view a customer's data **only with that customer's specific authorization**.
- **Plate lookup: none.** The lookup unit is the identified person, never a plate. A claimant could log in and see their *own* insurer, but software cannot query an arbitrary (third-party) plate.
- **API / ToS:** no API published; terms of use are not reachable pre-login — automated-access policy **unverified** (and moot, since there is no plate query to automate).
- **Freshness caveat:** policies bought in the last month may not yet appear (secondary source).
- **Verdict: dead end for third-party lookup.** Marginal future use: a claimant-driven "check your own insurer" assist, but the gov-SSO flow makes that impractical inside our collection flow.

Related statutory databases (fraud + statistical, under פקודת ביטוח רכב מנועי §§11a, 51 and תקנות התשס"ד-2004) are operated by ISO ClaimSearch Israel (Verisk) **for insurers only** — no public interface. הפול (pool.org.il) offers no plate-lookup service either.

## Track 1b — קרנית "איתור מבטח לרכב" (the official plate→חובה query)

- **What it is:** https://www.karnit.co.il/inquiry — plate + accident date → the compulsory (חובה) insurer at that date. Paid (credit card on the form; ~10₪ per a secondary guide — **fee unverified from primary source**).
- **Who may ask:** the form's זהות הפונה dropdown is restricted to **הנפגע / עו"ד או מיופה-כוח הנפגע / גוף זכאי** — no garage or agent option. Karnit's remit is bodily injury (חוק הפיצויים לנפגעי תאונות דרכים), so a property-damage-only claimant may not even qualify.
- **ToS / automation:** terms-of-use document could not be retrieved (WAF-blocked file download) — **unverified**; the restricted requester dropdown strongly implies per-victim, per-accident use only.
- **Verdict: exists and is exactly the data we want, but legally gray for our use case, חובה only (never מקיף), paid, and no API. Only after legal review, if the insurer-page route proves insufficient.**

## Track 2 — "BAFI / ב.א.פ.י" and the clearing side

- **A garage-settlement portal named "ב.א.פ.י" could not be verified to exist.** Extensive Hebrew searching found nothing; `bafi.co.il` is an unrelated product — "BAFI" by B-COM, a CRM for *insurance agencies* (do not confuse the two).
- **What does exist:** **מרכז הסליקה של חברות ביטוח בע"מ** (slika-ins.co.il), a subsidiary of איגוד חברות הביטוח. It runs the cross-insurer DB of רכב-רכוש coverage + paid claims — but exposes it only to **the vehicle's owner and to insurers**. Its public product is **infocar.co.il**: insurance-history report by plate, registered owner (or authorizee) only, ~10₪, citing חוק הגנת הפרטיות. It also runs the insurer↔משרד הרישוי M2M gateway, "קל-כבד" clearing, etc. Nothing a garage or our system can query.
- **Garages actually work per-insurer:** ClaimAI's own FAQ says it "פותחת לבד את התביעה בפורטלים של חברות הביטוח" — each insurer runs its own הסדר portal; no public cross-insurer garage portal exists.
- **Questions for the garage-owner meeting (week of 2026-10-05 pricing talk follow-up):**
  1. Which portal(s)/systems does the פקידה log into per insurer for הסדר claims — and does any of them show coverage for an arbitrary plate *before* a claim is opened?
  2. Do they know or use anything called "ב.א.פ.י", and who operates it? (The name came from competitor context and resolved to nothing public.)
  3. Does their garage-management software (DMS) have an insurer-lookup integration — and sourced from where?
  4. When they trace a third-party insurer by hand today, what exactly do they do? (Their manual steps are probably the scrapeable primitive.)

## Track 3 — data.gov.il

- **Confirmed negative** via CKAN catalog API (2026-10-25): no dataset carries per-vehicle insurance data. `q=ביטוח` hits only ביטוח-נט (CMA aggregate industry stats), service-index scores, pension funds; `q=ביטוח רכב` → 0.
- The vehicle-registry resource we already use (`053cea08-…`, see `web/src/lib/vehicles/registry.ts` / `GET /api/vehicle/[plate]`) has no insurance fields — **but its `baalut` field (פרטי / ליסינג / השכרה) lets us replicate ClaimAI's leasing exclusion**: their "בדוק" explicitly states "לא ניתן לבצע בדיקה לרכבי ליסינג", so pre-filtering leasing/fleet plates before any lookup is both a UX and cost win.

## Track 4 — Commercial vendors / how ClaimAI does it

- **ClaimAI does not disclose its source.** Its site says the check runs "לפי מספר רישוי ותאריך אירוע" with the leasing exclusion. That input signature matches (inference, flagged): fan-out across **insurers' public cover-check pages**, and/or Karnit.
- **The scrapeable primitive exists:** Harel runs a public **"בדיקת כיסוי ביטוחי"** — enter the hitting vehicle's plate + event date, get whether it was covered at Harel (`harel-group.co.il/.../cover-check.aspx`, confirmed live; JS-heavy). Insurers offer these **openly for third parties** — that is their purpose.
- **savetime.co.il/tools/vehicle-insurance** advertises exactly this as a product: both plates + event date, "בודק במקביל מול 16 חברות ביטוח", basic use free. (**Partially verified** — site unreachable from the research machine due to a DNS anomaly; described from search snippets.) Its existence confirms the fan-out approach is viable and marketed openly.
- Other car-check sites (check-car, autoboom, find-car, konesonline) are registry wrappers; check-car explicitly states insurance data is not publicly available. No insurance-data vendor ("דטה קאר" etc.) was found — **unverified/nonexistent**.
- Per-insurer scraping legality: each insurer's תנאי שימוש governs; not reviewed per-insurer in this pass. Technically fragile (CAPTCHA/WAF likely — harb and karnit already WAF-block plain curl).

## Privacy — חוק הגנת הפרטיות

The whole ecosystem treats plate→insurer as **personal data** (plate → owner is resolvable): infocar restricts to the registered owner citing the law; הר הביטוח requires government-grade ID + specific consent for מורשים; Karnit restricts to the injured party. Implications for us:

- Querying the **claimant's own** plate with their consent (they gave it to us to handle their claim) is the defensible case — same posture as the existing registry lookup.
- Querying the **third party's** plate is precisely what the insurer cover-check pages exist for — insurers offer them openly to accident third parties, which is our claimant's position. Using those channels keeps us inside the intended use.
- Keep the query minimal (plate + accident date in, insurer-name + covered-y/n out), **store only the answer** (`at_fault_insurer`), log the claimant's consent/context (the claim itself is that context), and keep the accident-date requirement — it scopes every query to a concrete claim rather than a general dossier.

## Per-insurer cover-check inventory (swept 2026-10-28, re-swept 2026-10-30)

**Method (re-sweep):** Google query `איפה הרכב מבוטח <שם המבטחת>` per insurer (the user's query — it surfaces checkers the insurers don't link from their TP-claims pages, which is why the first sweep missed menora/clal/phoenix's direct URL), plus an insurance agent's public toolbox page that lists a checker link per insurer ([amoshd.co.il/existence-insurance2](https://amoshd.co.il/existence-insurance2/) — "בדיקת קיום ביטוח רכב עבור תביעות צד ג'", data credited to סו"ב גל ברזני). Every URL below was then opened live in a browser and the form's DOM read. **No forms were submitted**, so each tool's output is inferred from its own page copy, not observed.

### The 11 canonical insurers (`web/src/lib/submission/directory.ts`)

| key | URL (verified live) | inputs | obstacles |
|---|---|---|---|
| `migdal` | my.migdal.co.il/car-insurance/support/third-party-policy-examination | event date + plate | reCAPTCHA; JS-only; סחר policies excluded |
| `menora` | menoramivt.co.il/car-insurance-validity/ | radio **חובה / מקיף וצד ג'** + plate + event date (y/m/d) | no CAPTCHA on the form; site-wide Radware bot management |
| `hachshara` | hcsra.co.il/tsad-gimel/ | plate + date (y/m/d) | none observed — the cleanest |
| `harel` | harel-group.co.il/Insurance/car/information/calculators/Pages/cover-check.aspx (form is an iframe at apps.harel-group.co.il/VehicleInsuranceCoverage) | event date + **both** plates + caller name + phone (all mandatory) | invisible reCAPTCHA; most PII of any checker |
| `clal` | clalbit.co.il/influence/ ("האם הרכב מבוטח בכלל") | `licenseNumber` + `eventDate` (DD/MM/YYYY) | none detected; fleets (ציי רכב) excluded |
| `phoenix` | **thirdpartyclaim.fnx.co.il/coverage-check/at-fault-details** — direct deep link skips the portal's terms/ID gate | step 1: "מספר הרכב הפוגע" (wizard; event date presumably on the next step) | Angular SPA; no CAPTCHA detected |
| `ayalon` | ayalon-ins.co.il/third_party/ (also indexed: /car/having-policy) | plate + accident date (per Ayalon's own indexed copy) | **hCaptcha bot wall (ShieldSquare/perfdrive) on every visit** — still not verified live; needs a human check |
| `shlomo` | shlomo-bit.co.il/car_policy_status | רכוש: plate + event date (its חובה check needs the owner's ת"ז — unusable blind) | CAPTCHA |
| `libra` | lbr.co.il/שירות-ותביעות/בדיקת-כיסוי-צד-ג/ | plate + event date | none observed |
| `aig` | **aig.co.il/בדיקת-פוליסת-רכוש-פעילה** ("בדיקת פוליסת רכוש פעילה" — replaces the TP-portal login as the entry point) | `incidentDate` + `carNumber` | none detected; private cars only; page warns data may be stale for cancelled/frozen policies |
| `shomera` | forms.shomera.co.il/thirdparty/ (step 1 of the TP claim wizard; the older services.shomera.co.il/gimel/ is a 404) | hitting plate + event date (+ optional insured ת"ז) | CAPTCHA |

### Insurers missing from our canonical list

The at-fault vehicle can be insured anywhere — these sell private-car רכוש and have public checkers too, but **have no key in `directory.ts` / `claim-state.ts`**, so a hit couldn't even be stored as a canonical value today:

| insurer | URL (verified live) | inputs | obstacles |
|---|---|---|---|
| ביטוח ישיר (IDI; also the 9 מיליון brand) | 555.co.il/pearl/apps/agent-statuses/login ("מערכת לניהול תביעות צד ג'") | Yashir-insured plate + event date + claimant's plate **+ one-time code by SMS/email** | OTP — not a blind check; it's the TP-claims portal login. Large market share, so this is the biggest gap |
| weSure | we-sure.co.il/בדיקת-תוקף-הביטוח/ ("בדיקת קיום פוליסה") | `accDate` + `carId` + mandatory checkbox "הבדיקה נועדה לצרכי הגשת תביעה בלבד" | reCAPTCHA |
| ביטוח חקלאי | bth.co.il/insurance-check/ | `license-number` + `search-date` | reCAPTCHA |
| קש חתמים בינלאומיים | user.kesh-ins.co.il/Check_insurance ("בדיקה האם רכב מבוטח בקש") | `license` + `the_date` | none detected |

For חובה specifically, קרנית's paid query (Track 1b) is the cross-insurer route; among the per-insurer checkers only Menora's answers חובה.

### Rollup

- **15 insurers with a public plate+date checker** — all 11 canonical ones plus ביטוח ישיר, weSure, ביטוח חקלאי, קש. 14 verified field-by-field live; ayalon stays bot-walled.
- **No CAPTCHA detected (automation candidates):** hachshara, libra, clal, aig, phoenix, קש — plus menora's form (but behind site-wide Radware).
- **reCAPTCHA/hCaptcha/OTP:** migdal, harel, shlomo, shomera, weSure, ביטוח חקלאי, ayalon, ביטוח ישיר.
- No insurer documents any API or digital-partner program for this. The first sweep missed menora, clal and phoenix's direct URL because none is linked from the insurer's TP-claims pages; the user's Google query and the agent toolbox page found them.

Coverage caveats that apply across the board: almost every checker answers **רכב רכוש (מקיף/צד ג') only** — Menora's is the only one that also checks חובה; and fleet/trade/leasing policies (ציי רכב, סחר) are excluded at least at clal, migdal and aig (private cars only) — consistent with ClaimAI's leasing exclusion. Several pages carry a disclaimer that a positive answer is not an admission of liability or cover (weSure states it explicitly) — fine for routing a claim, not proof of cover.

**Automation feasibility caveat:** about half the checkers carry reCAPTCHA/hCaptcha, menora/ayalon run Radware/ShieldSquare bot management site-wide (ayalon's walls even a real browser), and ביטוח ישיר needs an OTP. Fully headless fan-out would be fragile and ToS-risky at several insurers. Two realistic implementation shapes:
1. **Assisted lookup (low risk, ships first):** per-insurer **deep links** from the claim screen, plate + event date displayed for copy-paste (or pre-filled where the URL allows) — the פקידה clicks through all 15 checkers in seconds instead of hunting each site. No scraping, no ToS exposure, works despite CAPTCHAs.
2. **Automated fan-out (ClaimAI parity):** start only with the friction-free checkers — **hachshara, libra, clal, aig, phoenix, קש** (no CAPTCHA detected) — as server-side adapters; treat reCAPTCHA- or bot-wall-protected ones (incl. menora) as deep-link-only until/unless proven stable. Per-insurer ToS review before automating each.

## Recommendation

1. **First route: per-insurer cover-check integration**, per the inventory above — ship the **assisted deep-link lookup** first (all 15 checkers, zero scraping risk), then promote the friction-free checkers (hachshara, libra, clal, aig, phoenix, קש) to **automated server-side adapters**. Prerequisite: add ביטוח ישיר, weSure, ביטוח חקלאי and קש to the canonical insurer keys, or a hit on them has nowhere to land. Gate it behind the existing `get_tp_insurer` task + prepare-submission panel: on hit, prefill the canonical insurer key; on miss/ambiguity, fall back to today's manual flow. Pre-filter leasing via registry `baalut`. Design each insurer as an independent adapter that can silently degrade, like `lookupVehicle` does — reCAPTCHA/bot-walls/OTP make headless automation fragile at migdal, harel, shlomo, shomera, menora, ayalon, weSure, ביטוח חקלאי, ביטוח ישיר. Because the checkers answer רכוש only (except Menora), a hit says where the vehicle's מקיף/צד ג' sits — which is the policy a property-damage claim goes against.
2. **Ask the garage first** (questions above) — if the pilot garage already has a portal or DMS feature that answers this, integrating *their* access may beat scraping.
3. **Karnit** only after legal review (requester-identity restriction, חובה-only, paid, no API).
4. **Drop** הר הביטוח, מרכז הסליקה/infocar, and data.gov.il as third-party-lookup routes — verified dead ends.

## Explicitly unverified

1. הר הביטוח terms of use (behind gov-SSO) — automated-access policy unknown.
2. Karnit's fee and terms-of-use document; whether a garage / property-damage claimant may lawfully use it.
3. The name "ב.א.פ.י" — resolved to nothing public; ask the garage.
4. ClaimAI's actual backend — inference only.
5. savetime.co.il details — search snippets only.
6. ~~The per-insurer inventory of cover-check endpoints~~ — done 2026-10-28 (table above). Re-swept 2026-10-30 (15 insurers). Still open: each checker's actual response shape (nothing was submitted), phoenix's steps after the plate field, and ayalon's form (hCaptcha bot wall; needs a human check).
