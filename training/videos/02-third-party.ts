// Video 2 — "תביעת צד ג׳".
// The other driver is at fault: the client reports it, the office picks the track
// ("דוח פרטי"), gathers the papers, builds the demand letter, sends it to the other side's
// insurer and follows it to payment. A short last chapter shows what differs in "הסדר".
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { OUT_DIR } from "../src/env.ts";
import { FIXTURES } from "../src/fixtures.ts";
import { MAIL_SINK_URL, sinkCount } from "../src/mail-sink.ts";
import type { Scene, Segment, StepCtx } from "../src/scene.ts";
import { showPdf } from "../src/stage/pdf-viewer.ts";

// The demo claim's money, as the appraiser's report fixture states it.
const DAMAGES = { repair: "8200", depreciation: "2500", fee: "900" };
const PAID = "13238"; // repair and fee with 18% VAT, plus depreciation
const SETTLEMENT_CLIENT = { name: "דוד מזרחי", phone: "0500000006" };
const DEMO_RECIPIENT = "claims@example.com"; // never a real insurer's mailbox on camera
// The demo business sends from the app: its system address and the mailbox that gets a copy.
const DEMO_MAIL = { inbound_alias: "musach-hadgama", claims_mailbox: "office@example.com" };
const mailInSink = async (): Promise<number> => {
  const n = await sinkCount();
  if (n === null) throw new Error(`the local mail sink is not running at ${MAIL_SINK_URL} — run "npm run mail-sink" and start the app as the README says`);
  return n;
};

const nextButton = (page: Page): Locator => page.getByRole("button", { name: /^(בוא נתחיל|המשך|שליחה לטיפול)$/ });
const next = ({ page, stage }: StepCtx) => stage.click(nextButton(page));
const chapter = (name: string, title: string) => ({
  name,
  run: async ({ stage }: StepCtx) => { await stage.caption(""); await stage.titleCard(title); },
});
const upload = async (page: Page, index: number, files: string[]) => {
  await page.locator('input[type="file"]').nth(index).setInputFiles(files);
};
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(name) });
const card = (inside: Locator) => inside.locator("xpath=ancestor::*[contains(@class,'rounded-xl') or contains(@class,'rounded-2xl')][1]");
const checklistRow = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text }).first();

// Adds a paper from its own row in the checklist, the way the office does it.
const addFromRow = async ({ page, stage }: StepCtx, rowText: string, file: string) => {
  const row = checklistRow(page, rowText);
  const chooser = page.waitForEvent("filechooser");
  chooser.catch(() => undefined); // a failed click reports itself; this must not shadow it
  await stage.click(row.getByRole("button", { name: "העלאה" }));
  await (await chooser).setFiles(file);
  await row.getByText("צפה בקובץ").waitFor({ timeout: 30_000 });
};

const claimId = (shared: Record<string, string>) => shared.claimUrl.split("/").pop() ?? "";
const serviceDb = ({ env }: StepCtx) => createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what} failed: ${r.error.message}`);
  return r.data as T;
};

// The claim exactly as the client sent it: its row, the other driver and the client's files.
type Row = Record<string, unknown>;
const snapshot = async (c: StepCtx): Promise<{ claim: Row; thirdParties: Row[]; documents: Row[] }> => {
  const db = serviceDb(c), id = claimId(c.shared);
  return {
    claim: must(await db.from("claims").select("*").eq("id", id).single(), "reading the demo claim") as Row,
    thirdParties: must(await db.from("third_parties").select("*").eq("claim_id", id), "reading the other driver") as Row[],
    documents: must(await db.from("claim_documents").select("*").eq("claim_id", id), "reading the client's files") as Row[],
  };
};

// ───────────────────────── The office opens the claim ─────────────────────────
const office: Segment = {
  surface: "desktop",
  title: "תביעת צד ג׳ — מהתאונה ועד התשלום",
  steps: [
    {
      name: "dashboard",
      caption: "לקוח התקשר: רכב אחר פגע בו. מתחילים כמו בכל תיק — ״+ תיק חדש״",
      run: async ({ page, stage, env }) => {
        await page.goto(`${env.baseUrl}/dashboard`);
        await page.getByRole("heading", { name: "תיקים" }).waitFor();
        await stage.click(page.getByRole("button", { name: "+ תיק חדש" }).first());
        await page.getByRole("heading", { name: "תיק חדש" }).waitFor();
      },
    },
    {
      name: "create-claim",
      caption: "שם וטלפון, ״צור וקבל קישור״ — ושולחים ללקוח את הקישור",
      run: async ({ page, stage, demo, shared }) => {
        await stage.type(page.getByLabel("שם הלקוח"), demo.client.name);
        await stage.type(page.getByLabel("טלפון הלקוח"), demo.client.phone);
        await stage.click(page.getByRole("button", { name: "צור וקבל קישור" }));
        await page.getByText("התיק נוצר").waitFor();
        const link = page.locator("input[readonly]").first();
        shared.clientUrl = await link.inputValue();
        if (!/\/c\/[^/]+$/.test(shared.clientUrl)) throw new Error("the created-claim card shows no client link");
        await stage.highlight(page.getByRole("link", { name: "שלח בוואטסאפ" }), 1800);
      },
    },
    {
      name: "no-track-yet",
      caption: "שימו לב: בפתיחת התיק לא בוחרים מסלול. המערכת תציע אותו לפי מה שהלקוח ימלא",
      run: async ({ stage }) => { await stage.hold(); },
    },
  ],
};

// ───────────────────────── The client, phone ─────────────────────────
const client: Segment = {
  surface: "phone",
  title: "הלקוח מדווח: הצד השני אשם",
  steps: [
    {
      name: "client-opens",
      caption: "הלקוח פותח את הקישור בטלפון ומתחיל למלא",
      run: async (c) => {
        const { page, stage, shared } = c;
        await page.goto(shared.clientUrl);
        await page.getByRole("heading", { name: "דיווח על תאונת רכב" }).waitFor();
        await stage.click(page.getByText("אני מאשר/ת איסוף הפרטים"));
        await next(c);
        for (const answer of ["לא, אין נפגעים", "אני (המבוטח)"]) {
          await stage.click(page.getByRole("button", { name: answer, exact: true }));
          await page.waitForTimeout(500);
        }
        await page.getByRole("heading", { name: "מי אשם בתאונה?" }).waitFor();
      },
    },
    {
      name: "client-fault",
      caption: "השאלה שקובעת את המסלול: ״מי אשם בתאונה?״ — הלקוח עונה ״הצד השני אשם״",
      // The answer is clicked as the next step begins, so this caption never sits over the next question.
      run: async ({ page, stage }) => { await stage.highlight(page.getByRole("button", { name: "הצד השני אשם", exact: true }), 2200); },
    },
    {
      name: "client-third-party-present",
      before: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "הצד השני אשם", exact: true }));
        await page.getByRole("heading", { name: "היה צד שני מעורב?" }).waitFor();
      },
      caption: "והיה צד שני מעורב — ״כן״",
      run: async ({ page, stage }) => { await stage.highlight(page.getByRole("button", { name: "כן", exact: true }), 1400); },
    },
    {
      name: "client-own-details",
      before: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "כן", exact: true }));
        await page.getByRole("heading", { name: "הרכב שלך" }).waitFor();
      },
      caption: "הרכב והפרטים שלו — בדיוק כמו בכל תיק",
      run: async (c) => {
        const { page, stage, demo } = c;
        await stage.type(page.getByLabel("מספר רישוי"), demo.vehicle.plate);
        await page.getByText("מולא ממאגר משרד התחבורה").waitFor();
        await next(c);
        await page.getByRole("heading", { name: "הפרטים שלך" }).waitFor();
        await page.getByLabel("תעודת זהות").fill(demo.insured.id_number);
        await page.getByLabel("עיר מגורים").fill(demo.insured.city);
        await page.locator("select").nth(0).selectOption({ label: demo.policyInsurerLabel });
        await page.locator("select").nth(1).selectOption({ label: demo.insuranceTypeLabel });
        await stage.hold(900);
      },
    },
    {
      name: "client-third-party",
      before: next,
      caption: "פרטי הצד השני: מספר הרישוי שלו, שם, טלפון — וחברת הביטוח שלו",
      run: async (c) => {
        const { page, stage, demo } = c;
        await page.getByRole("heading", { name: "פרטי הצד השני" }).waitFor();
        await stage.type(page.getByLabel("מספר רישוי"), demo.thirdParty.plate);
        await stage.type(page.getByLabel("שם הנהג השני"), demo.thirdParty.name);
        await stage.type(page.getByLabel("טלפון", { exact: true }), demo.thirdParty.phone);
      },
    },
    {
      name: "client-third-party-insurer",
      caption: "חברת הביטוח של הצד השני חשובה במיוחד: אליה תישלח הדרישה",
      run: async ({ page, stage, demo }) => {
        const insurer = page.locator("select").first();
        await stage.highlight(insurer, 900);
        await insurer.selectOption({ label: demo.thirdParty.insurerLabel });
        await stage.highlight(insurer, 1200);
      },
    },
    {
      name: "client-rest",
      before: next,
      caption: "מתי ואיפה, מה נפגע, ומה קרה — כמו בכל תיק",
      run: async (c) => {
        const { page, stage, demo } = c;
        await page.getByRole("heading", { name: "מתי ואיפה קרתה התאונה?" }).waitFor();
        await page.getByLabel("תאריך").fill(demo.accident.date);
        await page.getByLabel("שעה").fill(demo.accident.time);
        await page.getByLabel("עיר", { exact: true }).fill(demo.accident.city);
        await page.getByLabel("רחוב / שכונה").fill(demo.accident.street);
        await stage.hold(700);
        await next(c);
        await stage.click(page.getByRole("button", { name: "אחורי", exact: true }).first());
        await stage.click(page.getByRole("button", { name: "לא", exact: true }));
        await next(c);
        await page.getByRole("textbox").first().fill(demo.accident.description);
        await stage.hold(900);
      },
    },
    {
      name: "client-documents",
      before: next,
      caption: "רישיון נהיגה, רישיון רכב ותמונות נזק",
      run: async ({ page, stage }) => {
        await page.getByRole("heading", { name: "מסמכים ותמונות" }).waitFor();
        await upload(page, 0, [FIXTURES.licenceFront]);
        await stage.hold(700);
        await upload(page, 0, [FIXTURES.licenceBack]);
        await stage.hold(700);
        await upload(page, 1, [FIXTURES.registration]);
        await stage.hold(700);
        await upload(page, 2, [FIXTURES.car1, FIXTURES.car2, FIXTURES.car3]);
        await page.waitForFunction(
          '(document.body.innerText.match(/✅/g) || []).length === 6 && !document.body.innerText.includes("⏳")',
          undefined, { timeout: 45_000 },
        );
        await nextButton(page).scrollIntoViewIfNeeded();
      },
    },
    {
      name: "client-summary",
      before: next,
      caption: "בסיכום, כשיש צד שני, הלקוח מייפה את כוח חברת הביטוח לטפל בתביעת צד ג׳",
      run: async ({ page, stage }) => {
        await page.getByRole("heading", { name: "סיכום" }).waitFor();
        const widths = String(await page.evaluate("document.documentElement.scrollWidth + '/' + window.innerWidth"));
        if (widths !== "390/390") throw new Error(`summary page is wider than the phone screen (${widths}) — shorten demoClaim.accident.description`);
        await stage.click(page.getByText("אני מאשר/ת את ההצהרה ואת העברת המידע."));
        await stage.click(page.getByText("אני מייפה את כוח חברת הביטוח לטפל בתביעת צד ג׳"));
        await stage.hold(1200);
      },
    },
    {
      name: "client-submit",
      caption: "והוא שולח. מכאן הכול אצלכם",
      run: async (c) => {
        await next(c);
        await c.page.getByText("תודה. נעבור על הפרטים").waitFor({ timeout: 30_000 });
      },
    },
  ],
};

// ───────────────────────── Picking the track ─────────────────────────
const track: Segment = {
  surface: "desktop",
  title: "בחירת המסלול: דוח פרטי או הסדר",
  steps: [
    {
      name: "open-claim",
      caption: "התיק חזר מהלקוח. נכנסים אליו",
      run: async (c) => {
        const { page, stage, env, demo, shared } = c;
        await page.goto(`${env.baseUrl}/dashboard`);
        await stage.click(page.getByRole("link", { name: demo.client.name }).first());
        await page.waitForURL(new RegExp("/dashboard/[0-9a-f-]{36}"));
        shared.claimUrl = page.url().split("?")[0];
        await page.getByRole("heading", { name: "סיווג התביעה" }).waitFor();
        shared.asReceived = JSON.stringify(await snapshot(c)); // for the last chapter's second claim
      },
    },
    {
      name: "waiting-for-track",
      caption: "בראש התיק: ״התיק מחכה לאישור מסלול״. זה הצעד הראשון שלכם",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("התיק מחכה לאישור מסלול").first(), 2200); },
    },
    {
      name: "the-proposal",
      caption: "המערכת כבר מציעה: צד ג׳ — דוח פרטי, ומסבירה למה",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("הצעת המערכת:").first().locator("xpath=.."), 2600); },
    },
    {
      name: "card-report",
      caption: "דוח פרטי: מתקנים, אוספים תיק מלא עם שמאי וחשבונית, ודורשים פיצוי מלא — כולל ירידת ערך",
      run: async ({ page, stage }) => {
        await stage.highlight(page.getByRole("button", { name: "בחר דוח פרטי" }).locator("xpath=.."), 3200);
      },
    },
    {
      name: "card-settlement",
      caption: "הסדר: מבקשים מראש אישור ממבטחת הצד השני, והתיקון במוסך הסדר — מהיר יותר, פיצוי מופחת",
      run: async ({ page, stage }) => {
        await stage.highlight(page.getByRole("button", { name: "בחר הסדר" }).locator("xpath=.."), 3200);
      },
    },
    {
      name: "choose-report",
      caption: "ההחלטה שלכם. בתיק הזה בוחרים ״דוח פרטי״",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "בחר דוח פרטי" }));
        await page.getByText("מחכה לאישור מסלול").first().waitFor({ state: "hidden" });
      },
    },
    {
      name: "track-set",
      caption: "המסלול נקבע — ומעכשיו רשימת המסמכים והמשימות מותאמות לו",
      run: async ({ page, stage }) => {
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })");
        await stage.highlight(page.getByText("צד ג' — דוח").first(), 2200);
      },
    },
  ],
};

// ───────────────────────── The papers ─────────────────────────
const papers: Segment = {
  surface: "desktop",
  title: "המסמכים של דוח פרטי",
  steps: [
    {
      name: "checklist",
      caption: "״מסמכי חובה״: מה שהלקוח שלח כבר מסומן. מה שחסר — מסומן ״חוסם״ או מחכה להעלאה",
      run: async ({ page, stage, shared }) => {
        await page.goto(shared.claimUrl);
        await stage.highlight(card(page.getByText("מסמכי חובה").first()), 3000);
      },
    },
    {
      name: "waiting-on-client",
      caption: "בראש התיק רואים על מה מחכים מהלקוח — ו״שלח תזכורת ללקוח״ פותח לו הודעה מוכנה בוואטסאפ",
      run: async ({ page, stage }) => {
        await stage.highlight(page.getByText(/מחכים ל/).first(), 1800);
        await stage.highlight(page.getByRole("button", { name: /שלח תזכורת ללקוח/ }).first(), 1800);
      },
    },
    {
      name: "no-claim-row",
      caption: "״אישור אי-הגשת תביעה״ — הלקוח מבקש אותו מחברת הביטוח שלו. כשהוא מגיע, לוחצים ״העלאה״ בשורה",
      run: async (c) => { await addFromRow(c, "אישור אי-הגשת תביעה", FIXTURES.noClaim); },
    },
    {
      name: "appraiser-row",
      caption: "אחרי שהשמאי בדק את הרכב: פותחים את ״מסמכים נוספים״ ומעלים את דוח השמאי",
      run: async (c) => {
        await c.stage.click(c.page.getByText("מסמכים נוספים").first());
        await addFromRow(c, "כולל תמונות צבעוניות", FIXTURES.appraiserReport);
      },
    },
    {
      name: "invoice-row",
      caption: "ואחרי התיקון — את חשבונית התיקון",
      run: async (c) => { await addFromRow(c, "חשבונית תיקון מקורית", FIXTURES.repairInvoice); },
    },
    {
      name: "appraiser-amounts",
      caption: "המערכת קראה את דוח השמאי ומצאה בו את הסכומים. בודקים מול המסמך — ו״להכניס למכתב הדרישה״",
      run: async ({ page, stage }) => {
        // The figures are read from the uploaded report by the app itself, a little after the upload.
        const found = page.getByLabel("סכומים ממסמכי השמאי");
        for (let i = 0; i < 8 && !(await found.isVisible()); i++) { await page.waitForTimeout(4000); await page.reload(); }
        await stage.highlight(found, 3000);
        await stage.click(found.getByRole("button", { name: "להכניס למכתב הדרישה" }));
        await found.waitFor({ state: "hidden", timeout: 30_000 });
      },
    },
    {
      name: "tasks",
      caption: "במקביל, המשימות מתעדכנות לבד ואומרות מה הצעד הבא",
      run: async ({ page, stage }) => { await stage.highlight(card(page.getByPlaceholder("הוסף משימה…")), 2600); },
    },
  ],
};

// ───────────────────────── The demand letter ─────────────────────────
const demand: Segment = {
  surface: "desktop",
  title: "פירוט הנזק ומכתב הדרישה",
  steps: [
    {
      name: "form-tab",
      caption: "עוברים ללשונית ״טופס ההודעה״ ופותחים את עריכת שדות הטופס",
      run: async ({ page, stage, shared }) => {
        await page.goto(shared.claimUrl);
        await stage.click(tab(page, "טופס ההודעה"));
        await stage.click(page.getByRole("button", { name: /תקן שדות בטופס|ערוך שדות הטופס/ }));
        await page.getByRole("button", { name: "שמור שדות" }).waitFor();
      },
    },
    {
      name: "third-party-section",
      caption: "פרטי צד ג׳ שהלקוח מילא כבר כאן. אפשר להשלים — למשל מספר פוליסה של הצד השני",
      run: async ({ page, stage }) => {
        await stage.highlight(page.getByRole("group", { name: /^צד ג'/ }).first(), 2800);
      },
    },
    {
      name: "damages",
      caption: "״פירוט הנזק״: עלות התיקון וירידת הערך כבר כאן, מדוח השמאי. משלימים את שכר טרחת השמאי",
      run: async ({ page, stage }) => {
        const damages = page.getByRole("group", { name: "פירוט הנזק" });
        // What came from the appraiser's report is already here; the rest is typed.
        for (const [label, value] of [[/תיקון הרכב/, DAMAGES.repair], [/ירידת ערך/, DAMAGES.depreciation], [/שכ״ט שמאי/, DAMAGES.fee]] as const) {
          const field = damages.getByLabel(label);
          if ((await field.inputValue()).trim() === "") await stage.type(field, value);
          else await stage.highlight(field, 900);
        }
      },
    },
    {
      name: "damages-total",
      caption: "המע״מ והסכום הכולל מחושבים לבד",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("סה״כ").last().locator("xpath=.."), 2200); },
    },
    {
      name: "save-damages",
      caption: "שומרים — ומכתב הדרישה נוצר מחדש עם הסכומים",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "שמור שדות" }));
        await page.getByText("נשמר ✓").waitFor();
      },
    },
    {
      name: "demand-panel",
      caption: "״טופס דרישה למבטחת״: הדרישה מופנית אל חברת הביטוח של הצד השני, לא של הלקוח",
      run: async ({ page, stage }) => {
        await stage.highlight(page.getByText("טופס דרישה למבטחת").first().locator("xpath=ancestor::section[1]"), 3000);
      },
    },
    {
      name: "open-demand",
      caption: "״פתח / הורד״ מציג את המכתב",
      run: async ({ page, stage, shared, env }) => {
        // The link inside the demand panel: the accident notice above it has one of the same name.
        const link = card(page.getByRole("heading", { name: "טופס דרישה למבטחת" })).getByRole("link", { name: /פתח \/ הורד/ });
        const popup = page.context().waitForEvent("page", { timeout: 10_000 }).catch(() => null);
        await stage.click(link);
        await (await popup)?.close().catch(() => undefined);
        // Saving the amounts makes the letter again, and the link changes with it: read the
        // link as it is now, and once more if the old file is already gone.
        let bytes: Buffer = Buffer.alloc(0), status = 0;
        for (let i = 0; i < 6 && bytes.subarray(0, 5).toString() !== "%PDF-"; i++) {
          if (i > 0) await page.waitForTimeout(1500);
          const href = await link.getAttribute("href");
          if (!href) throw new Error("the demand letter link has no href");
          const res = await page.context().request.get(new URL(href, env.baseUrl).href);
          status = res.status();
          bytes = await res.body();
        }
        if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`the demand letter link did not return a PDF (status ${status})`);
        shared.demandPdf = path.join(OUT_DIR, "segments", "demand-letter.pdf");
        fs.writeFileSync(shared.demandPdf, bytes);
      },
    },
    {
      name: "the-demand-letter",
      caption: "מכתב הדרישה: פרטי האירוע, פירוט הנזק והסכום הנדרש — מוכן לשליחה",
      run: async ({ page, stage, shared }) => { await showPdf(page, shared.demandPdf, stage); },
    },
  ],
};

// ───────────────────────── Sending and following ─────────────────────────
const send: Segment = {
  surface: "desktop",
  title: "שליחה למבטחת של הצד השני",
  steps: [
    {
      name: "ready",
      // Off camera: the demo business is set up to send from the app, and the client's own
      // accident notice is generated, as video 1 shows.
      before: async (c) => {
        const { page, shared, env } = c;
        await mailInSink(); // stop here, before anything is filmed, if mail could leave this machine
        const agentId = String((JSON.parse(shared.asReceived) as { claim: Row }).claim.agent_id);
        must(await serviceDb(c).from("agents").update(DEMO_MAIL).eq("id", agentId).select("id"), "turning on sending for the demo business");
        await page.goto(`${shared.claimUrl}?tab=form`);
        const href = await page.getByRole("link", { name: "מלא טופס הודעה על תאונה" }).getAttribute("href");
        if (!href) throw new Error("the generate-form link has no href");
        const res = await page.context().request.get(new URL(href, env.baseUrl).href);
        if (!res.ok()) throw new Error(`generating the accident notice answered ${res.status()}`);
        await page.goto(shared.claimUrl);
        await page.getByText("להכין שליחה למבטחת").first().waitFor();
      },
      caption: "כשכל מסמכי החובה בתיק, בראש התיק מופיע: ״התיק מוכן — להכין שליחה למבטחת״",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("להכין שליחה למבטחת").first(), 2400); },
    },
    {
      name: "open-send",
      caption: "״פתח״ מעביר ללשונית השליחה. מבטחת היעד והנמען: של הצד השני",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: /^פתח/ }).first());
        await page.getByLabel("נמען").fill(DEMO_RECIPIENT);
        await stage.highlight(page.getByLabel("מבטחת היעד"), 2200);
      },
    },
    {
      name: "send-attachments",
      caption: "הקבצים לצירוף כבר מסומנים — כולל מכתב הדרישה — וסכום הדרישה מולא מפירוט הנזק",
      run: async ({ page, stage }) => {
        await stage.highlight(page.getByText(/^קבצים לצירוף/).first().locator("xpath=.."), 2600);
        await stage.highlight(page.locator("#sub-demand"), 1800);
      },
    },
    {
      name: "send-button",
      caption: "שולחים ישר מהמערכת: ״שליחה למבטחת״",
      run: async ({ page, stage, shared }) => {
        shared.sinkBefore = String(await mailInSink());
        await stage.click(page.getByRole("button", { name: "שליחה למבטחת", exact: true }));
        await page.getByRole("heading", { name: "לשלוח את התיק למבטחת?" }).waitFor();
      },
    },
    {
      name: "send-confirm",
      caption: "לפני שהמייל יוצא רואים בדיוק מה נשלח: אל מי, העתק לתיבה שלכם, הנושא — שמקשר את התשובות לתיק — והקבצים",
      run: async ({ page, stage }) => { await stage.highlight(card(page.getByRole("heading", { name: "לשלוח את התיק למבטחת?" })), 3600); },
    },
    {
      name: "send-now",
      caption: "״שליחה״ — והמייל יוצא למבטחת עם כל הקבצים",
      run: async ({ page, stage, shared }) => {
        await stage.click(page.getByRole("button", { name: "שליחה", exact: true }));
        await page.getByText("נשלחה למבטחת").first().waitFor({ timeout: 45_000 });
        // The mail must have gone to the local sink, and nowhere else.
        if ((await mailInSink()) !== Number(shared.sinkBefore) + 1) throw new Error("the app did not send through the local mail sink — start it as the README says");
      },
    },
    {
      name: "sent",
      caption: "התיק עבר ל״נשלחה למבטחת״, ונפתחה משימת מעקב",
      run: async ({ page, stage }) => {
        await tab(page, "סקירה").click();
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })");
        await stage.highlight(page.getByText("נשלחה למבטחת").first(), 2400);
      },
    },
    {
      name: "correspondence",
      caption: "המייל שנשלח שמור בתיק, תחת ״התכתבות״. תשובות המבטחת לכתובת המערכת יגיעו לאותו מקום",
      run: async ({ page, stage }) => { await stage.highlight(page.locator("#correspondence"), 3000); },
    },
    chapter("chapter-follow", "מעקב עד התשלום"),
    {
      name: "status-approved",
      caption: "המבטחת ענתה? ״עדכון סטטוס״ — ובוחרים מה היא השיבה. כאן: אישרה",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "עדכון סטטוס" }).first());
        await page.getByRole("heading", { name: "עדכון סטטוס מול המבטחת" }).waitFor();
        await stage.click(page.getByRole("button", { name: "אושרה — ממתין לתשלום" }));
        await stage.click(page.getByRole("button", { name: "עדכון", exact: true }));
        await page.getByRole("heading", { name: "עדכון סטטוס מול המבטחת" }).waitFor({ state: "hidden" });
        await stage.highlight(page.getByText("אושרה — ממתין לתשלום").first(), 1800);
      },
    },
    {
      name: "status-paid",
      caption: "כשהכסף מגיע: ״שולמה״, מצרפים את הודעת התשלום ורושמים את הסכום",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "עדכון סטטוס" }).first());
        const dialog = page.getByRole("heading", { name: "עדכון סטטוס מול המבטחת" });
        await dialog.waitFor();
        await stage.click(page.getByRole("button", { name: "שולמה", exact: true }));
        // The dialog's own file field, not the drop zone on the page behind it.
        await dialog.locator("xpath=ancestor::div[.//input[@type='file']][1]").locator('input[type="file"]').setInputFiles(FIXTURES.paymentNotice);
        await page.waitForTimeout(600);
        await stage.type(page.locator("#handling-paid"), PAID);
        await stage.click(page.getByRole("button", { name: "עדכון", exact: true }));
        await dialog.waitFor({ state: "hidden", timeout: 30_000 });
      },
    },
    {
      name: "closed",
      caption: "התביעה שולמה והתיק נסגר. כל המסמכים והסכומים נשארים בו",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("שולמה").first(), 2400); },
    },
  ],
};

// ───────────────────────── What differs in "הסדר" ─────────────────────────
// A second claim with the same facts, made off camera from the first one's answers and
// put on the settlement track through the app's own route.
const makeSettlementClaim = async (c: StepCtx) => {
  const { page, env, shared } = c;
  const db = serviceDb(c), was = JSON.parse(shared.asReceived) as Awaited<ReturnType<typeof snapshot>>;
  const { id: _id, access_token: _token, created_at: _created, ...rest } = was.claim;
  const copy = must(await db.from("claims").insert({ ...rest, client_name: SETTLEMENT_CLIENT.name, client_phone: SETTLEMENT_CLIENT.phone })
    .select("id").single(), "copying the demo claim") as { id: string };
  for (const [table, rows] of [["third_parties", was.thirdParties], ["claim_documents", was.documents]] as const) {
    if (rows.length) must(await db.from(table).insert(rows.map(({ id: _i, ...r }) => ({ ...r, claim_id: copy.id }))).select("id"), `copying ${table}`);
  }
  const res = await page.context().request.patch(`${env.baseUrl}/api/claims/${copy.id}/classify`, { data: { claim_type: "third_party_settlement" } });
  if (!res.ok()) throw new Error(`putting the copy on the settlement track answered ${res.status()}`);
  shared.settlementUrl = `${env.baseUrl}/dashboard/${copy.id}`;
};

const settlement: Segment = {
  surface: "desktop",
  title: "ומה שונה במסלול ״הסדר״?",
  steps: [
    {
      name: "settlement-claim",
      before: makeSettlementClaim,
      caption: "תיק אחר, אותה תאונה — אבל כאן נבחר ״הסדר״",
      run: async ({ page, stage, shared }) => {
        await page.goto(shared.settlementUrl);
        await stage.highlight(page.getByText("צד ג' — הסדר").first(), 2400);
      },
    },
    {
      name: "settlement-checklist",
      caption: "רשימת המסמכים קצרה: בלי דוח שמאי, בלי חשבונית ובלי מכתב דרישה",
      run: async ({ page, stage }) => { await stage.highlight(card(page.getByText("מסמכי חובה").first()), 3000); },
    },
    {
      name: "settlement-task",
      caption: "המשימה הראשונה: לשלוח למבטחת הצד השני בקשת אישור הסדר",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("לשלוח בקשת אישור הסדר").first(), 2600); },
    },
    {
      name: "settlement-milestone",
      caption: "כשהמבטחת מאשרת, מסמנים ב״אבני דרך״: ״אושר מסלול מוסך הסדר״ — ורק אז הרכב נכנס לתיקון",
      run: async ({ page, stage }) => {
        await stage.click(page.getByText("אבני דרך").first());
        await stage.highlight(checklistRow(page, "אושר מסלול מוסך הסדר"), 3000);
      },
    },
    {
      name: "the-end",
      run: async ({ stage }) => {
        await stage.caption("");
        await stage.titleCard("תביעת צד ג׳: בוחרים מסלול, אוספים, שולחים ועוקבים", 3500);
      },
    },
  ],
};

const scene: Scene = { id: "02-third-party", segments: [office, client, track, papers, demand, send, settlement] };
export default scene;
