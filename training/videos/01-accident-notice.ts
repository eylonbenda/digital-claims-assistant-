// Video 1 — "מפתיחת תיק ועד טופס הודעה".
// Chapters: open a claim → send the link → the client's side (phone) → the accident notice.
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { OUT_DIR } from "../src/env.ts";
import { FIXTURES } from "../src/fixtures.ts";
import type { Scene, Segment, StepCtx } from "../src/scene.ts";
import { showPdf } from "../src/stage/pdf-viewer.ts";

const nextButton = (page: Page): Locator => page.getByRole("button", { name: /^(בוא נתחיל|המשך|שליחה לטיפול)$/ });
const next = ({ page, stage }: StepCtx) => stage.click(nextButton(page));
// The wizard pre-fills what the office already entered (name, phone): type only what is empty.
const typeIfEmpty = async ({ stage }: StepCtx, field: Locator, text: string) => {
  if ((await field.inputValue()).trim() === "") await stage.type(field, text);
  else await stage.highlight(field, 500);
};
const chapter = (name: string, title: string) => ({
  name,
  run: async ({ stage }: StepCtx) => { await stage.caption(""); await stage.titleCard(title); },
});

// ───────────────────────── Chapters 1–2: the office, desktop ─────────────────────────
const office: Segment = {
  surface: "desktop",
  title: "פתיחת תיק",
  steps: [
    {
      name: "dashboard",
      caption: "זה מסך התיקים — כל התיקים הפתוחים במקום אחד",
      run: async ({ page, env }) => {
        await page.goto(`${env.baseUrl}/dashboard`);
        await page.getByRole("heading", { name: "תיקים" }).waitFor();
      },
    },
    {
      name: "open-new-claim",
      caption: "לקוח התקשר אחרי תאונה? לוחצים על ״+ תיק חדש״",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "+ תיק חדש" }).first());
        await page.getByRole("heading", { name: "תיק חדש" }).waitFor();
      },
    },
    {
      name: "client-details",
      caption: "ממלאים את שם הלקוח ומספר הטלפון שלו",
      run: async ({ page, stage, demo }) => {
        await stage.type(page.getByLabel("שם הלקוח"), demo.client.name);
        await stage.type(page.getByLabel("טלפון הלקוח"), demo.client.phone);
      },
    },
    {
      name: "create-claim",
      caption: "ולוחצים על ״צור וקבל קישור״",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "צור וקבל קישור" }));
        await page.getByText("התיק נוצר").waitFor();
      },
    },
    chapter("chapter-send-link", "שליחת הקישור ללקוח"),
    {
      name: "the-link",
      caption: "התיק נוצר, ויש לו קישור אישי ללקוח",
      run: async ({ page, stage, shared }) => {
        const link = page.locator("input[readonly]").first();
        await stage.highlight(link);
        shared.clientUrl = await link.inputValue();
        if (!/\/c\/[^/]+$/.test(shared.clientUrl)) throw new Error("the created-claim card shows no client link");
      },
    },
    {
      name: "send-whatsapp",
      caption: "״שלח בוואטסאפ״ פותח הודעה מוכנה ללקוח, עם הקישור בפנים",
      // Highlighted only: the link leaves the app for WhatsApp, which is not ours to film.
      run: async ({ page, stage }) => { await stage.highlight(page.getByRole("link", { name: "שלח בוואטסאפ" }), 2200); },
    },
    {
      name: "copy-option",
      caption: "אפשר גם להעתיק את הקישור ולשלוח בכל דרך אחרת",
      run: async ({ page, stage }) => { await stage.highlight(page.getByRole("button", { name: "העתק", exact: true }).first()); },
    },
  ],
};

// ───────────────────────── Chapter 3: the client, phone ─────────────────────────
const upload = async (page: Page, index: number, files: string[]) => {
  await page.locator('input[type="file"]').nth(index).setInputFiles(files);
};

const client: Segment = {
  surface: "phone",
  title: "הצד של הלקוח",
  steps: [
    {
      name: "client-opens",
      caption: "הלקוח לוחץ על הקישור בטלפון — בלי סיסמה ובלי אפליקציה",
      run: async ({ page, shared }) => {
        await page.goto(shared.clientUrl);
        await page.getByRole("heading", { name: "דיווח על תאונת רכב" }).waitFor();
      },
    },
    {
      name: "client-consent",
      caption: "הוא מאשר את העברת הפרטים ומתחיל",
      run: async (c) => {
        await c.stage.click(c.page.getByText("אני מאשר/ת איסוף הפרטים"));
        await next(c);
      },
    },
    {
      name: "client-quick-questions",
      caption: "ארבע שאלות קצרות — לחיצה אחת לכל שאלה",
      run: async ({ page, stage }) => {
        for (const answer of ["לא, אין נפגעים", "אני (המבוטח)", "הצד השני אשם", "כן"]) {
          await stage.click(page.getByRole("button", { name: answer, exact: true }));
          await page.waitForTimeout(500);
        }
        await page.getByRole("heading", { name: "הרכב שלך" }).waitFor();
      },
    },
    {
      name: "client-vehicle",
      caption: "מקלידים מספר רישוי — ופרטי הרכב מתמלאים לבד",
      run: async (c) => {
        const { page, stage, demo } = c;
        await stage.type(page.getByLabel("מספר רישוי"), demo.vehicle.plate);
        await page.getByText("מולא ממאגר משרד התחבורה").waitFor();
        await stage.hold(1500);
        await next(c);
      },
    },
    {
      name: "client-insured",
      caption: "השם והטלפון כבר מולאו מהתיק — משלימים ת״ז, עיר וביטוח",
      run: async (c) => {
        const { page, stage, demo } = c;
        await page.getByRole("heading", { name: "הפרטים שלך" }).waitFor();
        await typeIfEmpty(c, page.getByLabel("שם פרטי"), demo.insured.first_name);
        await typeIfEmpty(c, page.getByLabel("שם משפחה"), demo.insured.last_name);
        await typeIfEmpty(c, page.getByLabel("תעודת זהות"), demo.insured.id_number);
        await typeIfEmpty(c, page.getByLabel("טלפון נייד"), demo.insured.mobile);
        await typeIfEmpty(c, page.getByLabel("עיר מגורים"), demo.insured.city);
        const insurer = page.locator("select").nth(0), type = page.locator("select").nth(1);
        await stage.highlight(insurer, 700);
        await insurer.selectOption({ label: demo.policyInsurerLabel });
        await stage.highlight(type, 700);
        await type.selectOption({ label: demo.insuranceTypeLabel });
        await next(c);
      },
    },
    {
      name: "client-third-party",
      caption: "פרטי הצד השני — ואם אין אותם, אפשר לדלג",
      run: async (c) => {
        const { page, stage, demo } = c;
        await page.getByRole("heading", { name: "פרטי הצד השני" }).waitFor();
        await stage.type(page.getByLabel("מספר רישוי"), demo.thirdParty.plate);
        await stage.type(page.getByLabel("שם הנהג השני"), demo.thirdParty.name);
        await stage.type(page.getByLabel("טלפון", { exact: true }), demo.thirdParty.phone);
        const insurer = page.locator("select").first();
        await stage.highlight(insurer, 700);
        await insurer.selectOption({ label: demo.thirdParty.insurerLabel });
        await next(c);
      },
    },
    {
      name: "client-when-where",
      caption: "מתי ואיפה קרתה התאונה",
      run: async (c) => {
        const { page, stage, demo } = c;
        await page.getByRole("heading", { name: "מתי ואיפה קרתה התאונה?" }).waitFor();
        await page.getByLabel("תאריך").fill(demo.accident.date);
        await page.getByLabel("שעה").fill(demo.accident.time);
        await stage.type(page.getByLabel("עיר", { exact: true }), demo.accident.city);
        await stage.type(page.getByLabel("רחוב / שכונה"), demo.accident.street);
        await next(c);
      },
    },
    {
      name: "client-damage",
      caption: "מסמנים איפה הרכב נפגע",
      run: async (c) => {
        const { page, stage } = c;
        await stage.click(page.getByRole("button", { name: "אחורי", exact: true }).first());
        await stage.click(page.getByRole("button", { name: "לא", exact: true }));
        await next(c);
      },
    },
    {
      name: "client-description",
      caption: "ומתארים במילים פשוטות מה קרה",
      run: async (c) => {
        const { page, stage, demo } = c;
        await stage.type(page.getByRole("textbox").first(), demo.accident.description);
        await next(c);
      },
    },
    {
      name: "client-documents",
      caption: "מצלמים רישיון נהיגה משני הצדדים, רישיון רכב ותמונות של הנזק",
      run: async (c) => {
        const { page, stage } = c;
        await page.getByRole("heading", { name: "מסמכים ותמונות" }).waitFor();
        await upload(page, 0, [FIXTURES.licenceFront]);
        await stage.hold(1200);
        await upload(page, 0, [FIXTURES.licenceBack]);
        await stage.hold(1200);
        await upload(page, 1, [FIXTURES.registration]);
        await stage.hold(1200);
        await upload(page, 2, [FIXTURES.car1, FIXTURES.car2, FIXTURES.car3]);
        await nextButton(page).and(page.locator(":enabled")).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(2500); // let the car photos finish uploading too
        await nextButton(page).scrollIntoViewIfNeeded();
      },
    },
    {
      name: "client-documents-next",
      caption: "אין מסמך בהישג יד? מסמנים ״אשלח בהמשך״ וממשיכים",
      run: async (c) => { await next(c); },
    },
    {
      name: "client-summary",
      caption: "סיכום של כל מה שמולא — אפשר לתקן כל שורה",
      run: async ({ page, stage }) => {
        await page.getByRole("heading", { name: "סיכום" }).waitFor();
        // A wider-than-screen summary pans the recording sideways (see README, "known app quirk").
        const widths = String(await page.evaluate("document.documentElement.scrollWidth + '/' + window.innerWidth"));
        if (widths !== "390/390") throw new Error(`summary page is wider than the phone screen (${widths}) — shorten demoClaim.accident.description`);
        await stage.hold(1500);
        await stage.click(page.getByText("אני מאשר/ת את ההצהרה ואת העברת המידע."));
      },
    },
    {
      name: "client-submit",
      caption: "הלקוח מאשר ושולח",
      run: async (c) => {
        await next(c);
        await c.page.getByText("תודה. נעבור על הפרטים").waitFor({ timeout: 30_000 });
      },
    },
    {
      name: "client-done",
      caption: "זהו. מבחינת הלקוח — כשלוש דקות",
      run: async ({ stage }) => { await stage.hold(1200); },
    },
  ],
};

// ───────────────────────── Chapter 4: back in the office, desktop ─────────────────────────
const notice: Segment = {
  surface: "desktop",
  title: "טופס ההודעה",
  steps: [
    {
      name: "claim-arrived",
      caption: "ברגע שהלקוח שולח, התיק מתעדכן במסך התיקים",
      run: async ({ page, stage, env, demo }) => {
        await page.goto(`${env.baseUrl}/dashboard`);
        await stage.highlight(page.getByRole("link", { name: demo.client.name }).first(), 2000);
      },
    },
    {
      name: "open-claim",
      caption: "נכנסים לתיק — כל מה שהלקוח מילא כבר כאן",
      run: async ({ page, stage, demo }) => {
        await stage.click(page.getByRole("link", { name: demo.client.name }).first());
        await page.waitForURL(new RegExp("/dashboard/[0-9a-f-]{36}"));
        await page.getByRole("tab", { name: "טופס ההודעה" }).waitFor();
      },
    },
    {
      name: "form-tab",
      caption: "עוברים ללשונית ״טופס ההודעה״",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("tab", { name: "טופס ההודעה" }));
        await page.getByText("טופס ממולא").first().waitFor();
      },
    },
    {
      name: "form-ready",
      caption: "הטופס של חברת הביטוח כבר מולא אוטומטית מהפרטים של הלקוח",
      run: async ({ page, stage }) => { await stage.highlight(page.getByText("טופס ממולא").first(), 2200); },
    },
    {
      name: "open-editor",
      caption: "חסר פרט? פותחים את ״השלם / תקן שדות בטופס״",
      run: async ({ page, stage }) => {
        await stage.click(page.getByRole("button", { name: "תקן שדות בטופס" }));
        await page.getByRole("button", { name: "שמור שדות" }).waitFor();
      },
    },
    {
      name: "edit-field",
      caption: "משלימים — למשל מספר פוליסה — ושומרים",
      run: async ({ page, stage, demo }) => {
        await stage.type(page.getByLabel("מספר פוליסה").first(), demo.policyNumber);
        await stage.click(page.getByRole("button", { name: "שמור שדות" }));
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "generate-form",
      caption: "ולוחצים על ״מלא טופס הודעה על תאונה״",
      run: async ({ page, stage, shared, env }) => {
        const link = page.getByRole("link", { name: "מלא טופס הודעה על תאונה" });
        await stage.highlight(link, 1800);
        // The link opens the PDF in a new tab, and headless Chromium cannot display a PDF.
        // Fetch the very same URL with the agent's session and show those bytes instead.
        const href = await link.getAttribute("href");
        if (!href) throw new Error("the generate-form link has no href");
        const res = await page.context().request.get(new URL(href, env.baseUrl).href);
        const bytes = await res.body();
        if (!res.ok() || bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length < 10_000) {
          throw new Error(`the form endpoint did not return a PDF (status ${res.status()}, ${bytes.length} bytes)`);
        }
        shared.pdfPath = path.join(OUT_DIR, "segments", "filled-form.pdf");
        fs.writeFileSync(shared.pdfPath, bytes);
      },
    },
    {
      name: "the-filled-form",
      caption: "הטופס המלא, מוכן לשליחה לחברת הביטוח",
      run: async ({ page, stage, shared }) => { await showPdf(page, shared.pdfPath, stage); },
    },
    {
      name: "the-end",
      run: async ({ stage }) => {
        await stage.caption("");
        await stage.titleCard("מפתיחת תיק ועד טופס הודעה — בכמה דקות", 3500);
      },
    },
  ],
};

const scene: Scene = { id: "01-accident-notice", segments: [office, client, notice] };
export default scene;
