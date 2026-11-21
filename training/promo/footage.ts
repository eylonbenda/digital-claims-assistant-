// The product part of the promo, recorded live: the real app, driven the way the training
// video drives it (cursor, taps, typing), on a phone and in the office. Same safety rules as
// the training recorder (the seed guards the target, only the demo account is touched).
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoClaim as demo } from "../src/demo.ts";
import { loadEnv, OUT_DIR, TRAINING_ROOT, type Env } from "../src/env.ts";
import { PHONE_UA, loginAndCheckDatabase, stubVehicleLookup } from "../src/record.ts";
import { seed } from "../src/seed.ts";
import { attachStage } from "../src/stage/stage.ts";
import { AUDIENCES, COPY, type Audience } from "./copy.ts";
import { promoFixtures } from "./fixtures.ts";
import { startRecording, type Recording } from "./screencast.ts";

// The app's own layouts at their usual sizes, recorded at 1.5× so a 1080p frame is sharp.
const SCALE = 1.5;
// The office is recorded once per output shape, in the app's own layout for that width.
export type Shape = "wide" | "square" | "tall";
export const SHAPES: Shape[] = ["wide", "square", "tall"];
export const DESK: Record<Shape, { width: number; height: number }> = {
  wide: { width: 1280, height: 720 }, square: { width: 720, height: 720 }, tall: { width: 720, height: 900 },
};
export const PHONE = { width: 390, height: 720 };
const even = (n: number) => 2 * Math.floor((n * SCALE) / 2); // H.264 needs even sides
const px = (v: { width: number; height: number }) => ({ width: even(v.width), height: even(v.height) });
const TIMEOUT_MS = 15_000;

export type Footage = { audience: Audience; recordedAt: string; phone: Recording; desk: Record<Shape, { office: Recording; form: Recording; chase: Recording; handling: Recording }> };
export const footageDir = (audience: Audience, outDir = OUT_DIR) => path.join(outDir, "promo", "footage", audience);

const nextButton = (page: Page) => page.getByRole("button", { name: new RegExp("^(בוא נתחיל|המשך|שליחה לטיפול)$") });

// The garage's video must not say "agent", and no video may show the demo login.
async function unwanted(page: Page, audience: Audience, env: Env): Promise<string[]> {
  const words = [env.demoEmail.split("@")[0], ...(audience === "garage" ? ["סוכן"] : [])];
  return (await page.evaluate(`(() => {
    const words = ${JSON.stringify(words)}, hit = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) for (const w of words) {
      const i = (n.nodeValue || "").indexOf(w);
      if (i < 0 || getComputedStyle(n.parentElement).visibility === "hidden") continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length);
      for (const b of r.getClientRects()) if (b.width > 0 && b.bottom > 0 && b.top < innerHeight) hit.push(w);
    }
    return hit;
  })()`)) as string[];
}
async function assertClean(page: Page, audience: Audience, env: Env, where: string): Promise<void> {
  const seen = await unwanted(page, audience, env);
  if (seen.length) throw new Error(`"${seen[0]}" is on screen at ${where}`);
}

// The filled form, drawn from the real PDF bytes (headless Chromium has no PDF viewer).
async function showForm(page: Page, pdf: Buffer): Promise<void> {
  const origin = "http://training.local", pdfjs = path.join(TRAINING_ROOT, "node_modules", "pdfjs-dist", "build");
  const viewer = `<!doctype html><html><head><meta charset="utf-8"><style>
    html{overflow-x:hidden}
    body{margin:0;background:#3c4a60;padding:0 0 40px}
    canvas{display:block;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);width:1180px;position:relative;left:calc((100vw - 1180px) / 2)}
    /* A narrow window shows the right-hand part of the page, where the values are, at a readable size. */
    @media (max-width:1000px){canvas{width:1280px;left:calc(100vw - 1280px)}}
  </style></head><body><script type="module">
    import * as pdfjs from "/pdf.min.mjs";
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    try {
      const pg = await (await pdfjs.getDocument({ url: "/doc.pdf" }).promise).getPage(1);
      const vp = pg.getViewport({ scale: 3 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      document.body.appendChild(c);
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      window.__pdfDone = true;
    } catch (e) { window.__pdfError = String(e); }
  </script></body></html>`;
  const files: Record<string, { body: Buffer | string; contentType: string }> = {
    "/viewer.html": { body: viewer, contentType: "text/html; charset=utf-8" },
    "/pdf.min.mjs": { body: fs.readFileSync(path.join(pdfjs, "pdf.min.mjs")), contentType: "text/javascript" },
    "/pdf.worker.min.mjs": { body: fs.readFileSync(path.join(pdfjs, "pdf.worker.min.mjs")), contentType: "text/javascript" },
    "/doc.pdf": { body: pdf, contentType: "application/pdf" },
  };
  await page.route(`${origin}/**`, (route) => {
    const hit = files[new URL(route.request().url()).pathname];
    return hit ? route.fulfill({ body: hit.body, contentType: hit.contentType }) : route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`${origin}/viewer.html`);
  await page.waitForFunction("window.__pdfDone || window.__pdfError", undefined, { timeout: 30_000 });
  const error = String(await page.evaluate("window.__pdfError || ''"));
  if (error) throw new Error(`rendering the filled form failed: ${error}`);
}

// A steady scroll driven from Node, so the pace is the same on any machine.
async function glide(page: Page, from: number, to: number, ms: number): Promise<void> {
  const ticks = Math.max(1, Math.round(ms / 33));
  for (let i = 0; i <= ticks; i++) {
    const k = i / ticks, e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    await page.evaluate(`window.scrollTo(0, ${Math.round(from + (to - from) * e)})`);
    await page.waitForTimeout(33);
  }
}

export async function recordFootage(env: Env, audience: Audience): Promise<Footage> {
  const { markerPhone, agentId } = await seed(env, { businessName: COPY[audience].businessName }); // guards the target first
  const dir = footageDir(audience);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const fx = promoFixtures();
  const authFile = path.join(dir, "auth.json");
  let at = "login";
  const browser = await chromium.launch();
  const open = async (kind: "desk" | "phone", shape: Shape = "wide"): Promise<{ ctx: BrowserContext; page: Page }> => {
    const ctx = await browser.newContext({
      viewport: kind === "desk" ? DESK[shape] : PHONE, deviceScaleFactor: SCALE, locale: "he-IL", timezoneId: "Asia/Jerusalem", acceptDownloads: true,
      ...(kind === "phone" ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : { storageState: authFile }),
    });
    await stubVehicleLookup(ctx);
    // The one thing hidden from the real screen: the demo account's login address.
    if (kind === "desk") await ctx.addInitScript({ content: `(() => {
      const who = ${JSON.stringify(env.demoEmail.split("@")[0])};
      const hide = () => { if (!document.body) return;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) if ((n.nodeValue || "").includes(who) && n.parentElement) n.parentElement.style.visibility = "hidden"; };
      new MutationObserver(hide).observe(document, { childList: true, subtree: true, characterData: true });
      document.addEventListener("DOMContentLoaded", hide);
    })()` });
    const page = await ctx.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    return { ctx, page };
  };

  try {
    await loginAndCheckDatabase(browser, env, markerPhone, authFile);

    // Off camera: the office opens the claim and gets the client's link.
    at = "open-claim";
    const setup = await open("desk");
    await setup.page.goto(`${env.baseUrl}/dashboard`);
    await setup.page.getByRole("button", { name: "+ תיק חדש" }).first().click();
    await setup.page.getByLabel("שם הלקוח").fill(demo.client.name);
    await setup.page.getByLabel("טלפון הלקוח").fill(demo.client.phone);
    await setup.page.getByRole("button", { name: "צור וקבל קישור" }).click();
    await setup.page.getByText("התיק נוצר").waitFor();
    const clientUrl = await setup.page.locator("input[readonly]").first().inputValue();
    if (!new RegExp("/c/[^/]+$").test(clientUrl)) throw new Error("the created-claim card shows no client link");
    await setup.ctx.close();

    // ── The client, on a phone ──
    at = "client";
    const mobile = await open("phone");
    const phone = mobile.page, tap = await attachStage(phone, "phone", { captionPage: phone }); // no in-page caption zone
    await phone.goto(clientUrl);
    await phone.getByText("אני מאשר/ת איסוף הפרטים").click();
    await nextButton(phone).click();
    await phone.getByRole("button", { name: "לא, אין נפגעים", exact: true }).waitFor();
    await phone.waitForTimeout(400);
    const rec = await startRecording(phone, path.join(dir, "phone.mp4"), px(PHONE));
    await phone.waitForTimeout(500);
    rec.mark("questions");
    for (const answer of ["לא, אין נפגעים", "אני (המבוטח)", "הצד השני אשם", "כן"]) {
      await tap.click(phone.getByRole("button", { name: answer, exact: true }));
      await phone.waitForTimeout(350);
    }
    await phone.getByRole("heading", { name: "הרכב שלך" }).waitFor();
    rec.mark("questions-end");
    await tap.type(phone.getByLabel("מספר רישוי"), demo.vehicle.plate);
    await phone.getByText("מולא ממאגר משרד התחבורה").waitFor();
    await phone.waitForTimeout(900);
    rec.mark("vehicle-end");
    await nextButton(phone).click();
    await phone.getByRole("heading", { name: "הפרטים שלך" }).waitFor();
    await phone.getByLabel("תעודת זהות").fill(demo.insured.id_number);
    await phone.getByLabel("עיר מגורים").fill(demo.insured.city);
    await phone.locator("select").nth(0).selectOption({ label: demo.policyInsurerLabel });
    await phone.locator("select").nth(1).selectOption({ label: demo.insuranceTypeLabel });
    await nextButton(phone).click();
    await phone.getByRole("heading", { name: "פרטי הצד השני" }).waitFor();
    await phone.getByLabel("מספר רישוי").fill(demo.thirdParty.plate);
    await phone.getByLabel("שם הנהג השני").fill(demo.thirdParty.name);
    await phone.getByLabel("טלפון", { exact: true }).fill(demo.thirdParty.phone);
    await phone.locator("select").first().selectOption({ label: demo.thirdParty.insurerLabel });
    await nextButton(phone).click();
    await phone.getByRole("heading", { name: "מתי ואיפה קרתה התאונה?" }).waitFor();
    await phone.getByLabel("תאריך").fill(demo.accident.date);
    await phone.getByLabel("שעה").fill(demo.accident.time);
    await phone.getByLabel("עיר", { exact: true }).fill(demo.accident.city);
    await phone.getByLabel("רחוב / שכונה").fill(demo.accident.street);
    await nextButton(phone).click();
    await phone.getByRole("button", { name: "אחורי", exact: true }).first().click();
    await phone.getByRole("button", { name: "לא", exact: true }).click();
    await nextButton(phone).click();
    await phone.getByRole("textbox").first().fill(demo.accident.description);
    await nextButton(phone).click();
    await phone.getByRole("heading", { name: "מסמכים ותמונות" }).waitFor();
    await phone.evaluate("window.scrollTo(0, 0)");
    await phone.waitForTimeout(500);
    const inputs = phone.locator('input[type="file"]');
    const uploaded = (n: number) => phone.waitForFunction(
      `(document.body.innerText.match(/✅/g) || []).length === ${n} && !document.body.innerText.includes("⏳")`, undefined, { timeout: 45_000 });
    const show = async (n: number) => {
      await inputs.nth(n).locator("xpath=..").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await phone.waitForTimeout(450);
    };
    rec.mark("docs");
    await phone.waitForTimeout(500);
    await inputs.nth(0).setInputFiles([fx.licenceFront]); await uploaded(1);
    await inputs.nth(0).setInputFiles([fx.licenceBack]); await uploaded(2);
    await phone.waitForTimeout(400);
    await show(1);
    // The registration is not at hand: the client promises it for later, as clients do.
    await tap.click(phone.getByText(new RegExp("אין לי את רישיון ה?רכב")));
    await phone.waitForTimeout(500);
    await show(2);
    await inputs.nth(2).setInputFiles(fx.cars.slice(0, 3)); await uploaded(5);
    await phone.waitForTimeout(900);
    rec.mark("docs-end");
    await nextButton(phone).click();
    await phone.getByRole("heading", { name: "סיכום" }).waitFor();
    await phone.getByText("אני מאשר/ת את ההצהרה ואת העברת המידע.").click();
    await nextButton(phone).scrollIntoViewIfNeeded();
    await phone.waitForTimeout(300);
    rec.mark("send");
    await tap.click(nextButton(phone));
    await phone.getByText("תודה. נעבור על הפרטים").waitFor({ timeout: 30_000 });
    await phone.waitForTimeout(2200);
    rec.mark("send-end");
    const phoneRec = await rec.stop();
    await mobile.ctx.close();

    // Off camera: the office completes the one detail the client did not have.
    at = "policy-number";
    const prep = await open("desk");
    await prep.page.goto(`${env.baseUrl}/dashboard`);
    await prep.page.getByRole("link", { name: demo.client.name }).first().click();
    await prep.page.getByRole("tab", { name: "טופס ההודעה" }).click();
    await prep.page.getByRole("button", { name: "תקן שדות בטופס" }).click();
    await prep.page.getByLabel("מספר פוליסה").first().fill(demo.policyNumber);
    await prep.page.getByRole("button", { name: "שמור שדות" }).click();
    await prep.page.getByText("נשמר ✓").waitFor();
    await prep.ctx.close();

    // ── The office: the claim arrived complete ──
    const deskRecs = {} as Footage["desk"];
    let claimUrl = "";
    for (const shape of SHAPES) {
    at = `office (${shape})`;
    const office = await open("desk", shape);
    const desk = office.page, stage = await attachStage(desk, "desktop");
    await desk.goto(`${env.baseUrl}/dashboard`);
    const row = desk.getByRole("link", { name: demo.client.name }).first();
    await row.waitFor();
    await desk.waitForTimeout(600);
    await assertClean(desk, audience, env, "the dashboard");
    const rec2 = await startRecording(desk, path.join(dir, `office-${shape}.mp4`), px(DESK[shape]));
    await desk.waitForTimeout(500);
    rec2.mark("arrived");
    await stage.highlight(row, 1300);
    await stage.click(row);
    await desk.waitForURL(new RegExp("/dashboard/[0-9a-f-]{36}"));
    claimUrl = desk.url().split("?")[0];
    await desk.getByText("הצעת המערכת").first().waitFor();
    await desk.waitForTimeout(700);
    await assertClean(desk, audience, env, "the claim page");
    rec2.mark("claim");
    await stage.highlight(desk.getByText("הצעת המערכת").first().locator("xpath=.."), 1900);
    await assertClean(desk, audience, env, "the system's proposal");
    rec2.mark("files");
    await stage.click(desk.getByRole("tab", { name: "קבצים" }));
    await desk.getByText("תמונות הרכב").first().waitFor();
    await desk.waitForTimeout(700);
    rec2.mark("files-shown");
    // Cut from the edit: the pictures load lazily, so the page is walked once off camera.
    const y0 = Number(await desk.evaluate("scrollY"));
    await desk.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
    await desk.waitForTimeout(400);
    await desk.evaluate(`window.scrollTo(0, ${y0})`);
    await desk.waitForFunction("[...document.images].filter((i) => i.getClientRects().length > 0).every((i) => i.complete)", undefined, { timeout: 30_000 });
    await desk.waitForTimeout(600);
    rec2.mark("files-ready");
    await desk.waitForTimeout(500);
    const filesTop = Number(await desk.evaluate("scrollY")), filesEnd = Number(await desk.evaluate("Math.min(document.documentElement.scrollHeight - innerHeight, scrollY + 420)"));
    await glide(desk, filesTop, filesEnd, 1800);
    await desk.waitForTimeout(900);
    await assertClean(desk, audience, env, "the files tab");
    rec2.mark("files-end");
    const officeRec = await rec2.stop();

    // ── The form fills itself ──
    at = `form (${shape})`;
    await desk.evaluate("window.scrollTo(0, 0)");
    await desk.getByRole("tab", { name: "טופס ההודעה" }).click();
    await desk.getByText("טופס ממולא").first().waitFor();
    await desk.waitForTimeout(600);
    const rec3 = await startRecording(desk, path.join(dir, `form-${shape}.mp4`), px(DESK[shape]));
    await desk.waitForTimeout(400);
    rec3.mark("tab");
    await stage.highlight(desk.getByText("טופס ממולא").first(), 1400);
    await assertClean(desk, audience, env, "the form tab");
    const link = desk.getByRole("link", { name: "מלא טופס הודעה על תאונה" });
    const popup = office.ctx.waitForEvent("page", { timeout: 10_000 }).catch(() => null);
    await stage.click(link);
    await (await popup)?.close().catch(() => undefined);
    await desk.waitForTimeout(350);
    rec3.mark("tab-end");
    const href = await link.getAttribute("href");
    if (!href) throw new Error("the generate-form link has no href");
    const res = await office.ctx.request.get(new URL(href, env.baseUrl).href);
    const bytes = await res.body();
    if (!res.ok() || bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length < 10_000) {
      throw new Error(`the form endpoint did not return a PDF (status ${res.status()}, ${bytes.length} bytes)`);
    }
    await showForm(desk, bytes);
    // Start below the printed line that says "agent": it is the insurer's wording, not ours.
    const pageH = Number(await desk.evaluate("document.querySelector('canvas').getBoundingClientRect().height"));
    await desk.evaluate(`window.scrollTo(0, ${Math.round(pageH * 0.142)})`);
    await desk.waitForTimeout(500);
    rec3.mark("pdf");
    await desk.waitForTimeout(1300);
    await glide(desk, pageH * 0.142, pageH * 0.5, 4200);
    await desk.waitForTimeout(1400);
    rec3.mark("pdf-end");
    const formRec = await rec3.stop();
    await office.ctx.close();
    deskRecs[shape] = { office: officeRec, form: formRec } as Footage["desk"][Shape];
    }

    // Off camera: the office confirms the track, through the app's own route.
    at = "confirm the track";
    const claimId = claimUrl.split("/").pop() ?? "";
    const db = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ok = (r: { error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what} failed: ${r.error.message}`); };
    const asOffice = await open("desk");
    const api = `${env.baseUrl}/api/claims/${claimId}`;
    const answered = async (res: { ok(): boolean; status(): number; text(): Promise<string> }, what: string) => {
      if (!res.ok()) throw new Error(`${what} answered ${res.status()}: ${(await res.text()).slice(0, 120)}`);
    };
    await answered(await asOffice.ctx.request.patch(`${api}/classify`, { data: { claim_type: "own_policy" } }), "classify");

    // ── A document is missing: the office reminds the client ──
    for (const shape of SHAPES) {
    at = `missing document (${shape})`;
    ok(await db.from("outbound_events").delete().eq("claim_id", claimId), "clearing earlier reminders"); // each shape films the first one
    const office = await open("desk", shape);
    const desk = office.page, stage = await attachStage(desk, "desktop");
    // The reminder opens WhatsApp in a new tab; the recording stays in the app.
    await office.ctx.route(new RegExp("wa\\.me|whatsapp\\.com"), (r) => r.abort());
    office.ctx.on("page", (p) => { if (p !== desk) p.close().catch(() => undefined); });
    await desk.goto(claimUrl);
    const remind = desk.getByRole("button", { name: new RegExp("שלח תזכורת ללקוח") }).first();
    await remind.waitFor();
    await desk.getByText(new RegExp("מחכים ל")).first().waitFor();
    await desk.waitForTimeout(700);
    await assertClean(desk, audience, env, "the claim with a missing document");
    const rec = await startRecording(desk, path.join(dir, `chase-${shape}.mp4`), px(DESK[shape]));
    await desk.waitForTimeout(500);
    rec.mark("missing");
    await stage.highlight(desk.getByText(new RegExp("מחכים ל")).first(), 1700);
    await stage.click(remind);
    await desk.waitForTimeout(1300);
    await assertClean(desk, audience, env, "the claim after the reminder");
    rec.mark("missing-end");
    deskRecs[shape].chase = await rec.stop();
    await office.ctx.close();
    }

    // Off camera: the document arrives and is added to the claim.
    at = "the missing document arrives";
    await answered(await asOffice.ctx.request.post(`${api}/documents`, { multipart: {
      type: "vehicle_reg", file: { name: "registration.png", mimeType: "image/png", buffer: fs.readFileSync(fx.registration) },
    } }), "adding the document");
    await asOffice.ctx.close();
    // What the claim looks like before it is sent, to put it back for each shape.
    const before = await db.from("claims").select("status, checklist_state").eq("id", claimId).eq("agent_id", agentId).single();
    ok(before, "reading the demo claim");
    const tasksBefore = await db.from("tasks").select("id, status, completed_at").eq("claim_id", claimId);
    ok(tasksBefore, "reading the demo claim's tasks");
    const kept = (tasksBefore.data ?? []) as { id: string; status: string; completed_at: string | null }[];

    // ── The file is complete: send it to the insurer, then follow it ──
    for (const shape of SHAPES) {
    at = `send and follow (${shape})`;
    ok(await db.from("claims").update({ ...before.data, handling_status: null, handling_status_changed_at: null })
      .eq("id", claimId).eq("agent_id", agentId), "putting the demo claim back");
    const now = await db.from("tasks").select("id").eq("claim_id", claimId);
    ok(now, "listing tasks");
    const extra = ((now.data ?? []) as { id: string }[]).map((t) => t.id).filter((id) => !kept.some((k) => k.id === id));
    if (extra.length) ok(await db.from("tasks").delete().in("id", extra), "removing later tasks");
    for (const t of kept) ok(await db.from("tasks").update({ status: t.status, completed_at: t.completed_at }).eq("id", t.id), "restoring a task");

    const office = await open("desk", shape);
    const desk = office.page, stage = await attachStage(desk, "desktop");
    await desk.goto(claimUrl);
    await desk.getByText("להכין שליחה למבטחת").first().waitFor();
    const openSend = desk.getByRole("button", { name: new RegExp("^פתח") }).first();
    await openSend.waitFor();
    await desk.waitForTimeout(700);
    await assertClean(desk, audience, env, "the complete claim");
    // The task list is filmed only where it can be shown without the word the garage cut avoids.
    const task = desk.getByText("פתיחת תביעה מול מבטח הלקוח").first();
    let taskY = -1;
    if (await task.count()) {
      taskY = Number(await task.evaluate((el) => Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - innerHeight * 0.55))));
      await desk.evaluate(`window.scrollTo(0, ${taskY})`);
      await desk.waitForTimeout(250);
      if ((await unwanted(desk, audience, env)).length) taskY = -1;
      await desk.evaluate("window.scrollTo(0, 0)");
      await desk.waitForTimeout(400);
    }
    const rec4 = await startRecording(desk, path.join(dir, `handling-${shape}.mp4`), px(DESK[shape]));
    await desk.waitForTimeout(500);
    if (taskY >= 0) {
      rec4.mark("tasks");
      if (taskY > 20) await glide(desk, 0, taskY, 900);
      await stage.highlight(task.locator("xpath=ancestor::li[1]"), 1600);
      rec4.mark("tasks-end");
      await desk.evaluate("window.scrollTo(0, 0)");
      await desk.waitForTimeout(500);
    }
    rec4.mark("send");
    await stage.highlight(desk.getByText("להכין שליחה למבטחת").first(), 1100);
    await stage.click(openSend);
    await desk.getByLabel("נמען").fill("claims@example.com");
    await desk.waitForTimeout(1100);
    const confirm = desk.getByRole("button", { name: "סומן כנשלח", exact: true });
    const sendTop = Number(await desk.evaluate("scrollY"));
    const sendEnd = Number(await confirm.evaluate((el) => Math.round(el.getBoundingClientRect().top + scrollY - innerHeight * 0.7)));
    if (sendEnd > sendTop) await glide(desk, sendTop, sendEnd, 2400);
    await desk.waitForTimeout(400);
    await assertClean(desk, audience, env, "the send screen");
    await stage.click(confirm);
    await desk.waitForTimeout(500);
    await stage.click(desk.getByRole("button", { name: "כן — סמן כנשלח" }));
    const sent = desk.getByText("נשלחה למבטחת").first(), update = desk.getByRole("button", { name: "עדכון סטטוס" }).first();
    await sent.waitFor();
    // The send tab is gone once the claim is sent, and the app leaves the page body empty
    // until a tab is picked, so the office goes back to the overview.
    await desk.getByRole("tab", { name: new RegExp("סקירה") }).click();
    await desk.waitForTimeout(150);
    await desk.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })");
    await desk.waitForTimeout(1000);
    await stage.highlight(sent, 1400);
    await assertClean(desk, audience, env, "the sent claim");
    rec4.mark("send-end");

    // Off camera (cut from the edit): six days pass with no answer.
    ok(await db.from("claims").update({ handling_status_changed_at: new Date(Date.now() - 6 * 86_400_000).toISOString() })
      .eq("id", claimId).eq("agent_id", agentId), "ageing the sent claim");
    await desk.goto(claimUrl);
    await update.waitFor();
    await desk.getByText(new RegExp("6 ימים")).first().waitFor();
    await desk.waitForTimeout(700);
    rec4.mark("status");
    await stage.highlight(sent, 1500);
    await stage.click(update);
    const dialog = desk.getByRole("heading", { name: "עדכון סטטוס מול המבטחת" });
    await dialog.waitFor();
    await desk.waitForTimeout(900);
    await stage.click(desk.getByRole("button", { name: "אושרה — ממתין לתשלום" }));
    await desk.waitForTimeout(500);
    await stage.click(desk.getByRole("button", { name: "עדכון", exact: true }));
    await dialog.waitFor({ state: "hidden" });
    const approved = desk.getByText("אושרה — ממתין לתשלום").first();
    await approved.waitFor();
    await desk.waitForTimeout(500);
    await stage.highlight(approved, 1700);
    await assertClean(desk, audience, env, "the updated claim");
    await desk.waitForTimeout(500);
    rec4.mark("status-end");
    deskRecs[shape].handling = await rec4.stop();
    await office.ctx.close();
    }

    fs.rmSync(authFile, { force: true }); // a session file is not a deliverable
    const footage: Footage = { audience, recordedAt: new Date().toISOString(), phone: phoneRec, desk: deskRecs };
    fs.writeFileSync(path.join(dir, "footage.json"), JSON.stringify(footage, null, 2));
    return footage;
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true }); // never leave a half set that looks usable
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new Error(`recording for ${audience} failed at "${at}": ${msg}`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const asked = process.argv[2];
  if (asked && !AUDIENCES.includes(asked as Audience)) {
    console.error(`usage: npm run promo:footage -- [${AUDIENCES.join("|")}]`);
    process.exit(1);
  }
  const env = loadEnv();
  (async () => {
    for (const audience of asked ? [asked as Audience] : AUDIENCES) {
      console.log(`recording ${audience}`);
      const f = await recordFootage(env, audience);
      console.log(`  · phone ${f.phone.seconds.toFixed(1)}s`);
      for (const sh of SHAPES) console.log(`  · ${sh}: office ${f.desk[sh].office.seconds.toFixed(1)}s, form ${f.desk[sh].form.seconds.toFixed(1)}s, chase ${f.desk[sh].chase.seconds.toFixed(1)}s, handling ${f.desk[sh].handling.seconds.toFixed(1)}s`);
    }
  })().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
}
