// Stage 1 of the promo: walk the real app once per audience and save sharp stills of the
// moments the promo shows. Same safety rules as the training recorder (the seed guards the
// target, only the demo account is touched, the vehicle lookup is stubbed).
import { chromium, type Browser, type Locator, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoClaim as demo } from "../src/demo.ts";
import { loadEnv, TRAINING_ROOT, type Env } from "../src/env.ts";
import { PHONE_UA, loginAndCheckDatabase, stubVehicleLookup } from "../src/record.ts";
import { seed } from "../src/seed.ts";
import { AUDIENCES, COPY, type Audience } from "./copy.ts";
import { promoFixtures } from "./fixtures.ts";
import { CAPTURE_IDS, captureDir, checkManifest, type Capture, type CaptureId, type Avoid, type Manifest, type Mark } from "./manifest.ts";

// Narrow windows: the app's own responsive layouts, in which its text is large for the frame.
const DESK_SCALE = 2.5, PHONE_SCALE = 3;
const DESKTOP = { width: 520, height: 800 };
const PHONE = { width: 320, height: 640 };
const TIMEOUT_MS = 15_000;

const nextButton = (page: Page) => page.getByRole("button", { name: new RegExp("^(בוא נתחיל|המשך|שליחה לטיפול)$") });
const next = (page: Page) => nextButton(page).click();

// Runs in the page: where each needle is drawn, as fractions of the still (the viewport, or
// the whole page when `full`).
const findText = (needles: [string, string][], full: boolean) => `(() => {
  const needles = ${JSON.stringify(needles)}, out = [], full = ${full};
  const W = full ? document.documentElement.scrollWidth : innerWidth, H = full ? document.documentElement.scrollHeight : innerHeight;
  const ox = full ? scrollX : 0, oy = full ? scrollY : 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const text = n.nodeValue || "";
    for (const [what, needle] of needles) {
      for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
        const range = document.createRange();
        range.setStart(n, i); range.setEnd(n, i + needle.length);
        for (const b of range.getClientRects()) {
          if (b.width > 0 && (full || (b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth))) {
            out.push({ what, x: (b.left + ox) / W, y: (b.top + oy) / H, w: b.width / W, h: b.height / H });
          }
        }
      }
    }
  }
  return out;
})()`;

async function settle(page: Page): Promise<void> {
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(400); // let transitions finish: a still must not catch one mid-way
}

async function pdfFirstPagePng(browser: Browser, pdf: Buffer, needles: [Avoid["what"], string][]): Promise<{ png: Buffer; width: number; height: number; avoid: Avoid[] }> {
  const origin = "http://training.local";
  const pdfjs = path.join(TRAINING_ROOT, "node_modules", "pdfjs-dist", "build");
  const viewer = `<!doctype html><html><body style="margin:0"><script type="module">
    import * as pdfjs from "/pdf.min.mjs";
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    try {
      const doc = await pdfjs.getDocument({ url: "/doc.pdf" }).promise;
      const pg = await doc.getPage(1);
      const vp = pg.getViewport({ scale: 2.5 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      document.body.appendChild(c);
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      // Printed Hebrew may be stored in visual order, so each needle is looked for both ways.
      const needles = ${JSON.stringify(needles)}, found = [];
      for (const item of (await pg.getTextContent()).items) {
        for (const [what, needle] of needles) {
          if (!item.str.includes(needle) && !item.str.includes([...needle].reverse().join(""))) continue;
          const [x0, y0, x1, y1] = vp.convertToViewportRectangle([item.transform[4], item.transform[5], item.transform[4] + item.width, item.transform[5] + item.height]);
          found.push({ what, x: Math.min(x0, x1) / vp.width, y: Math.min(y0, y1) / vp.height, w: Math.abs(x1 - x0) / vp.width, h: Math.abs(y1 - y0) / vp.height });
        }
      }
      window.__pdfAvoid = found;
      window.__pdfDone = true;
    } catch (e) { window.__pdfError = String(e); }
  </script></body></html>`;
  const files: Record<string, { body: Buffer | string; contentType: string }> = {
    "/viewer.html": { body: viewer, contentType: "text/html; charset=utf-8" },
    "/pdf.min.mjs": { body: fs.readFileSync(path.join(pdfjs, "pdf.min.mjs")), contentType: "text/javascript" },
    "/pdf.worker.min.mjs": { body: fs.readFileSync(path.join(pdfjs, "pdf.worker.min.mjs")), contentType: "text/javascript" },
    "/doc.pdf": { body: pdf, contentType: "application/pdf" },
  };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 2300 } });
  try {
    const page = await ctx.newPage();
    await page.route(`${origin}/**`, (route) => {
      const hit = files[new URL(route.request().url()).pathname];
      return hit ? route.fulfill({ body: hit.body, contentType: hit.contentType }) : route.fulfill({ status: 404, body: "" });
    });
    await page.goto(`${origin}/viewer.html`);
    await page.waitForFunction("window.__pdfDone || window.__pdfError", undefined, { timeout: 30_000 });
    const error = String(await page.evaluate("window.__pdfError || ''"));
    if (error) throw new Error(`rendering the filled form failed: ${error}`);
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    return { png: await canvas.screenshot(), width: Math.round(box!.width), height: Math.round(box!.height), avoid: (await page.evaluate("window.__pdfAvoid")) as Avoid[] };
  } finally {
    await ctx.close();
  }
}

export async function capturePromo(env: Env, audience: Audience): Promise<Manifest> {
  const { markerPhone } = await seed(env, { businessName: COPY[audience].businessName }); // guards the target first
  const dir = captureDir(audience);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const fx = promoFixtures();
  const captures: Capture[] = [];
  let at = "login";

  const browser = await chromium.launch();
  // `parts`: named parts of the app whose place and text size are measured, so the promo can
  // point the camera at them. `full`: the whole page, not only the window.
  const shoot = async (page: Page, id: CaptureId, surface: "phone" | "desktop", parts: Record<string, Locator> = {}, full = false) => {
    at = id;
    if (full) { // lazy pictures load only once they have been on screen
      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      await page.waitForTimeout(300);
      await page.evaluate("window.scrollTo(0, 0)");
      await page.waitForFunction("[...document.images].filter((i) => i.getClientRects().length > 0).every((i) => i.complete)", undefined, { timeout: 30_000 });
    }
    await settle(page);
    const view = page.viewportSize()!;
    const [W, H, ox, oy] = (await page.evaluate(full
      ? "[document.documentElement.scrollWidth, document.documentElement.scrollHeight, scrollX, scrollY]"
      : "[innerWidth, innerHeight, 0, 0]")) as number[];
    const marks: Record<string, Mark> = {};
    for (const [name, part] of Object.entries(parts)) {
      const b = await part.first().boundingBox();
      if (!b) throw new Error(`the "${name}" part is not on screen for ${id}`);
      // The largest text inside the part: what a viewer is meant to read there.
      const px = await part.first().evaluate((el) => {
        let max = 0;
        for (const e of [el, ...Array.from(el.querySelectorAll("*"))]) {
          if (Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue ?? "").trim())) max = Math.max(max, parseFloat(getComputedStyle(e).fontSize));
        }
        return max || parseFloat(getComputedStyle(el).fontSize);
      });
      marks[name] = { x: (b.x + ox) / W, y: (b.y + oy) / H, w: b.width / W, h: b.height / H, px };
    }
    const avoid = (await page.evaluate(findText([["agent-word", "סוכן"], ["login", env.demoEmail.split("@")[0]]], full))) as Avoid[];
    const file = `${id}.png`;
    const png = await page.screenshot({ path: path.join(dir, file), fullPage: full });
    captures.push({ id, file, width: png.readUInt32BE(16), height: png.readUInt32BE(20), surface, cssWidth: view.width, marks, avoid });
    console.log(`  · ${audience}/${id}`);
  };
  const authFile = path.join(dir, "auth.json");

  try {
    await loginAndCheckDatabase(browser, env, markerPhone, authFile);

    // The office opens the claim and gets the client's link.
    const office = await browser.newContext({
      viewport: DESKTOP, deviceScaleFactor: DESK_SCALE, locale: "he-IL", timezoneId: "Asia/Jerusalem", storageState: authFile,
    });
    await stubVehicleLookup(office);
    const desk = await office.newPage();
    desk.setDefaultTimeout(TIMEOUT_MS);
    at = "open-claim";
    await desk.goto(`${env.baseUrl}/dashboard`);
    await desk.getByRole("button", { name: "+ תיק חדש" }).first().click();
    await desk.getByLabel("שם הלקוח").fill(demo.client.name);
    await desk.getByLabel("טלפון הלקוח").fill(demo.client.phone);
    await desk.getByRole("button", { name: "צור וקבל קישור" }).click();
    await desk.getByText("התיק נוצר").waitFor();
    const clientUrl = await desk.locator("input[readonly]").first().inputValue();
    if (!new RegExp("/c/[^/]+$").test(clientUrl)) throw new Error("the created-claim card shows no client link");

    // The client fills the wizard on a phone, not logged in.
    const mobile = await browser.newContext({
      viewport: PHONE, deviceScaleFactor: PHONE_SCALE, locale: "he-IL", timezoneId: "Asia/Jerusalem",
      isMobile: true, hasTouch: true, userAgent: PHONE_UA,
    });
    await stubVehicleLookup(mobile);
    const phone = await mobile.newPage();
    phone.setDefaultTimeout(TIMEOUT_MS);
    at = "wizard";
    await phone.goto(clientUrl);
    await phone.getByText("אני מאשר/ת איסוף הפרטים").click();
    await next(phone);
    await phone.getByRole("button", { name: "לא, אין נפגעים", exact: true }).waitFor();
    await shoot(phone, "client-question", "phone", { question: phone.getByRole("heading").first(), answer: phone.getByRole("button", { name: "לא, אין נפגעים", exact: true }) });
    for (const answer of ["לא, אין נפגעים", "אני (המבוטח)", "הצד השני אשם", "כן"]) {
      await phone.getByRole("button", { name: answer, exact: true }).click();
      await phone.waitForTimeout(400);
    }
    await phone.getByRole("heading", { name: "הרכב שלך" }).waitFor();
    await phone.getByLabel("מספר רישוי").fill(demo.vehicle.plate);
    await phone.getByText("מולא ממאגר משרד התחבורה").waitFor();
    await next(phone);
    await phone.getByRole("heading", { name: "הפרטים שלך" }).waitFor();
    await phone.getByLabel("תעודת זהות").fill(demo.insured.id_number);
    await phone.getByLabel("עיר מגורים").fill(demo.insured.city);
    await phone.locator("select").nth(0).selectOption({ label: demo.policyInsurerLabel });
    await phone.locator("select").nth(1).selectOption({ label: demo.insuranceTypeLabel });
    await next(phone);
    await phone.getByRole("heading", { name: "פרטי הצד השני" }).waitFor();
    await phone.getByLabel("מספר רישוי").fill(demo.thirdParty.plate);
    await phone.getByLabel("שם הנהג השני").fill(demo.thirdParty.name);
    await phone.getByLabel("טלפון", { exact: true }).fill(demo.thirdParty.phone);
    await phone.locator("select").first().selectOption({ label: demo.thirdParty.insurerLabel });
    await next(phone);
    await phone.getByRole("heading", { name: "מתי ואיפה קרתה התאונה?" }).waitFor();
    await phone.getByLabel("תאריך").fill(demo.accident.date);
    await phone.getByLabel("שעה").fill(demo.accident.time);
    await phone.getByLabel("עיר", { exact: true }).fill(demo.accident.city);
    await phone.getByLabel("רחוב / שכונה").fill(demo.accident.street);
    await next(phone);
    await phone.getByRole("button", { name: "אחורי", exact: true }).first().click();
    await phone.getByRole("button", { name: "לא", exact: true }).click();
    await next(phone);
    await phone.getByRole("textbox").first().fill(demo.accident.description);
    await next(phone);
    await phone.getByRole("heading", { name: "מסמכים ותמונות" }).waitFor();
    const inputs = phone.locator('input[type="file"]');
    // The three blocks of the step, and the button that ends it.
    const block = (n: number) => inputs.nth(n).locator("xpath=..");
    const docParts = () => ({ licence: block(0), registration: block(1), photos: block(2), next: nextButton(phone) });
    const docs = async (id: CaptureId) => { await phone.evaluate("window.scrollTo(0, 0)"); await shoot(phone, id, "phone", docParts(), true); };
    const uploaded = (n: number) => phone.waitForFunction(
      `(document.body.innerText.match(/✅/g) || []).length === ${n} && !document.body.innerText.includes("⏳")`,
      undefined, { timeout: 45_000 },
    );
    await docs("client-docs-0");
    at = "uploads";
    await inputs.nth(0).setInputFiles([fx.licenceFront]);
    await uploaded(1);
    await inputs.nth(0).setInputFiles([fx.licenceBack]);
    await uploaded(2);
    await docs("client-docs-1");
    await inputs.nth(1).setInputFiles([fx.registration]);
    await uploaded(3);
    await docs("client-docs-2");
    await inputs.nth(2).setInputFiles(fx.cars.slice(0, 3));
    await uploaded(6);
    await docs("client-docs-3");
    await next(phone);
    await phone.getByRole("heading", { name: "סיכום" }).waitFor();
    await phone.getByText("אני מאשר/ת את ההצהרה ואת העברת המידע.").click();
    await next(phone);
    await phone.getByText("תודה. נעבור על הפרטים").waitFor({ timeout: 30_000 });
    await phone.evaluate("window.scrollTo(0, 0)");
    await shoot(phone, "client-sent", "phone", { title: phone.getByRole("heading").first() });
    await mobile.close();

    // Back in the office: the claim arrived complete, and the form fills itself.
    at = "dashboard";
    await desk.goto(`${env.baseUrl}/dashboard`);
    const row = desk.getByRole("link", { name: demo.client.name }).first();
    await row.waitFor();
    await row.click();
    await desk.waitForURL(new RegExp("/dashboard/[0-9a-f-]{36}"));
    await desk.getByRole("tab", { name: "טופס ההודעה" }).waitFor();
    const tabs = desk.getByRole("tablist");
    const name = desk.getByRole("heading", { name: demo.client.name });
    await desk.getByText("הצעת המערכת").first().waitFor();
    await shoot(desk, "case-overview", "desktop", { name, tabs, verdict: desk.getByText("הצעת המערכת").first().locator("xpath=..") }, true);
    await desk.getByRole("tab", { name: "קבצים" }).click();
    await desk.getByText("תמונות הרכב").first().waitFor();
    await shoot(desk, "case-files", "desktop", { name, tabs }, true);
    await desk.evaluate("window.scrollTo(0, 0)");
    await desk.getByRole("tab", { name: "טופס ההודעה" }).click();
    await desk.getByText("טופס ממולא").first().waitFor();
    await desk.getByRole("button", { name: "תקן שדות בטופס" }).click();
    await desk.getByLabel("מספר פוליסה").first().fill(demo.policyNumber);
    await desk.getByRole("button", { name: "שמור שדות" }).click();
    await desk.getByText("נשמר ✓").waitFor();
    await desk.getByRole("button", { name: "תקן שדות בטופס" }).click().catch(() => undefined); // collapse the editor if it toggles
    await desk.evaluate("window.scrollTo(0, 0)");
    await shoot(desk, "form-tab", "desktop", {
      name, tabs, filled: desk.getByText("טופס ממולא").first().locator("xpath=.."),
      generate: desk.getByRole("link", { name: "מלא טופס הודעה על תאונה" }),
    }, true);

    at = "pdf-page-1";
    const href = await desk.getByRole("link", { name: "מלא טופס הודעה על תאונה" }).getAttribute("href");
    if (!href) throw new Error("the generate-form link has no href");
    const res = await office.request.get(new URL(href, env.baseUrl).href);
    const bytes = await res.body();
    if (!res.ok() || bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length < 10_000) {
      throw new Error(`the form endpoint did not return a PDF (status ${res.status()}, ${bytes.length} bytes)`);
    }
    await office.close();
    const pdf = await pdfFirstPagePng(browser, bytes, [["agent-word", "סוכן"], ["login", env.demoEmail.split("@")[0]]]);
    fs.writeFileSync(path.join(dir, "pdf-page-1.png"), pdf.png);
    captures.push({ id: "pdf-page-1", file: "pdf-page-1.png", width: pdf.width, height: pdf.height, surface: "pdf", cssWidth: Math.round(pdf.width / 2.5), avoid: pdf.avoid });
    console.log(`  · ${audience}/pdf-page-1`);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true }); // never leave a half set that looks usable
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new Error(`capture for ${audience} failed at "${at}": ${msg}`);
  } finally {
    await browser.close();
  }

  fs.rmSync(authFile, { force: true }); // a session file is not a deliverable
  const manifest: Manifest = { audience, capturedAt: new Date().toISOString(), captures };
  const problems = checkManifest(manifest, audience);
  if (problems.length) throw new Error(`capture for ${audience} is incomplete: ${problems.join("; ")}`);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const asked = process.argv[2];
  if (asked && !AUDIENCES.includes(asked as Audience)) {
    console.error(`usage: npm run promo:capture -- [${AUDIENCES.join("|")}]`);
    process.exit(1);
  }
  const env = loadEnv();
  (async () => {
    for (const audience of asked ? [asked as Audience] : AUDIENCES) {
      console.log(`capturing ${audience} (${CAPTURE_IDS.length} stills)`);
      await capturePromo(env, audience);
    }
  })().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
