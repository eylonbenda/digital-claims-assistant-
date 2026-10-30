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

## Per-insurer cover-check inventory (added 2026-10-28)

All 11 canonical insurers (keys per `web/src/lib/submission/directory.ts`) were swept: Hebrew search per insurer, then the actual page rendered live in a browser and the form's DOM read. **No forms were submitted**, so each tool's output format is inferred from its own page copy, not observed.

| key | status | URL | inputs | obstacles |
|---|---|---|---|---|
| `migdal` | standalone check | my.migdal.co.il/car-insurance/support/third-party-policy-examination | event date + plate | reCAPTCHA; JS-only; סחר policies excluded |
| `menora` | standalone check — **the only one covering חובה too** | menoramivt.co.il/car-insurance-validity/ ("בדיקת תוקף ביטוח רכב") | radio חובה / מקיף וצד ג' + plate + event date (y/m/d) | no CAPTCHA on the form; site-wide Radware bot management blocked an automated crawl (verified 2026-10-30) |
| `hachshara` | standalone check — cleanest | hcsra.co.il/tsad-gimel/ | plate + date (y/m/d) only | none observed (no CAPTCHA, no PII) |
| `harel` | standalone check (re-verified live) | harel-group.co.il/.../cover-check.aspx → iframe at apps.harel-group.co.il/VehicleInsuranceCoverage | event date + **both** plates + caller name + phone (all mandatory) | invisible reCAPTCHA; most PII of any peer |
| `clal` | standalone check ("האם הרכב מבוטח בכלל") | clalbit.co.il/influence/ | `licenseNumber` + `eventDate` (DD/MM/YYYY) | no CAPTCHA detected; Angular page, Glassbox recording; **fleet (ציי רכב) policies excluded** (verified 2026-10-30) |
| `phoenix` | embedded in TP intake portal | thirdpartyclaim.fnx.co.il | unverified — entry button doubles as terms-acceptance/ID gate | Angular SPA; gated |
| `ayalon` | standalone per Ayalon's own copy — **unverified live** | ayalon-ins.co.il/third_party/ | plate + accident date (per snippet) | hard ShieldSquare/Radware bot-wall blocked even a real browser; needs a human check |
| `shlomo` | standalone check | shlomo-bit.co.il/car_policy_status | rechush: plate + event date (the חובה check needs owner ת"ז — unusable blind) | CAPTCHA |
| `libra` | standalone check | lbr.co.il/שירות-ותביעות/בדיקת-כיסוי-צד-ג/ | plate + event date only | none observed |
| `aig` | check **is** the TP-portal login | services.aig.co.il/thirdparty/login | AIG-insured plate + event date + claimant's own plate | Angular SPA; no CAPTCHA detected |
| `shomera` | embedded as step 1 of TP claim wizard | forms.shomera.co.il/thirdparty/ | hitting plate + event date (+ optional insured ת"ז) | CAPTCHA |

**Rollup: all 11 have a public check** (9 verified field-by-field: harel, migdal, hachshara, shlomo, libra, aig, shomera, menora, clal; phoenix gated behind a terms/ID step; ayalon near-certain but bot-walled). The first sweep reported menora and clal as "none" — both checkers are real and live (`/car-insurance-validity/`, `/influence/`), found by the user and verified 2026-10-30; the sweep missed them because neither is linked from the insurer's TP-claims pages. No insurer documents any API or digital-partner program for this.

Coverage caveats that apply across the board: almost every checker answers **רכב רכוש (מקיף/צד ג') only** — Menora's is the only one that also checks חובה by plate+date; and fleet/trade policies (ציי רכב, סחר) are excluded at least at clal and migdal — consistent with ClaimAI's leasing exclusion.

**Automation feasibility caveat:** most checkers carry (invisible) reCAPTCHA, and menora/ayalon run Radware/ShieldSquare bot management site-wide (ayalon's blocked even a real browser). Fully headless fan-out would be fragile and ToS-risky at several insurers. Two realistic implementation shapes:
1. **Assisted lookup (low risk, ships first):** per-insurer **deep links** from the claim screen, plate + event date displayed for copy-paste (or pre-filled where the URL allows) — the פקידה clicks through all 11 checkers in seconds instead of hunting each site. No scraping, no ToS exposure, works despite CAPTCHAs.
2. **Automated fan-out (ClaimAI parity):** start only with the friction-free checkers — **hachshara and libra (no CAPTCHA), aig and clal (none detected)** — as server-side adapters; treat reCAPTCHA- or bot-wall-protected ones (incl. menora) as deep-link-only until/unless proven stable. Per-insurer ToS review before automating each.

## Recommendation

1. **First route: per-insurer cover-check integration**, per the inventory above — ship the **assisted deep-link lookup** first (all 11 insurers, zero scraping risk), then promote the friction-free checkers (hachshara, libra, aig, clal) to **automated server-side adapters**. Gate it behind the existing `get_tp_insurer` task + prepare-submission panel: on hit, prefill the canonical insurer key; on miss/ambiguity, fall back to today's manual flow. Pre-filter leasing via registry `baalut`. Design each insurer as an independent adapter that can silently degrade, like `lookupVehicle` does — reCAPTCHA/bot-walls make headless automation fragile at migdal, harel, shlomo, shomera, menora, ayalon. Because the checkers answer רכוש only (except Menora), a hit says where the vehicle's מקיף/צד ג' sits — which is the policy a property-damage claim goes against.
2. **Ask the garage first** (questions above) — if the pilot garage already has a portal or DMS feature that answers this, integrating *their* access may beat scraping.
3. **Karnit** only after legal review (requester-identity restriction, חובה-only, paid, no API).
4. **Drop** הר הביטוח, מרכז הסליקה/infocar, and data.gov.il as third-party-lookup routes — verified dead ends.

## Explicitly unverified

1. הר הביטוח terms of use (behind gov-SSO) — automated-access policy unknown.
2. Karnit's fee and terms-of-use document; whether a garage / property-damage claimant may lawfully use it.
3. The name "ב.א.פ.י" — resolved to nothing public; ask the garage.
4. ClaimAI's actual backend — inference only.
5. savetime.co.il details — search snippets only.
6. ~~The per-insurer inventory of cover-check endpoints~~ — done 2026-10-28 (table above). Still open within it: each checker's actual response shape (nothing was submitted), phoenix's inner fields (terms/ID gate), and ayalon's form (bot-wall; needs a human check).
