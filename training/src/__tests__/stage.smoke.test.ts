import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import { attachStage, type Surface } from "../stage/stage.ts";

let browser: Browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

const HTML = `<html dir="rtl"><body style="margin:0;height:2000px">
  <button onclick="document.title='clicked'" style="margin:300px 100px">אישור</button>
  <input aria-label="שם" /></body></html>`;

async function open(surface: Surface): Promise<Page> {
  const viewport = surface === "phone" ? { width: 390, height: 844 } : { width: 1280, height: 720 };
  const page = await (await browser.newContext({ viewport })).newPage(); // phone here is the 390x844 the tests assert against
  await page.setContent(HTML);
  return page;
}
const cap = (page: Page) => page.locator("[data-stage-caption]");

test("caption text is in the DOM, rtl, and at the top on phone", async () => {
  const page = await open("phone");
  const stage = await attachStage(page, "phone");
  await stage.caption("טופס PDF מוכן");
  assert.equal(await cap(page).textContent(), "טופס PDF מוכן");
  assert.equal(await cap(page).getAttribute("dir"), "rtl");
  assert.ok((await cap(page).boundingBox())!.y < 844 / 2);
});

test("caption is at the bottom on desktop", async () => {
  const page = await open("desktop");
  const stage = await attachStage(page, "desktop");
  await stage.caption("זה לוח הבקרה");
  assert.ok((await cap(page).boundingBox())!.y > 720 / 2);
});

test("overlay never intercepts clicks", async () => {
  const page = await open("desktop");
  const stage = await attachStage(page, "desktop");
  await stage.caption("לוחצים על אישור");
  await stage.click(page.getByRole("button", { name: "אישור" }));
  assert.equal(await page.title(), "clicked");
});

test("type fills the field", async () => {
  const page = await open("desktop");
  const stage = await attachStage(page, "desktop");
  await stage.type(page.getByLabel("שם"), "יעל");
  assert.equal(await page.getByLabel("שם").inputValue(), "יעל");
});

test("caption survives a navigation", async () => {
  const page = await open("desktop");
  const stage = await attachStage(page, "desktop");
  await stage.caption("נשאר אחרי מעבר עמוד");
  await page.goto("data:text/html,<html><body><p>second</p></body></html>");
  await cap(page).waitFor({ state: "attached", timeout: 3000 });
  assert.equal(await cap(page).textContent(), "נשאר אחרי מעבר עמוד");
});

test("title card covers the frame and then goes away", async () => {
  const page = await open("desktop");
  const stage = await attachStage(page, "desktop");
  const p = stage.titleCard("פתיחת תיק", 600);
  const card = page.locator("[data-stage-title]");
  await card.waitFor({ state: "visible", timeout: 2000 });
  const box = (await card.boundingBox())!;
  assert.ok(box.width >= 1280 && box.height >= 720);
  await p;
  assert.equal(await card.isVisible(), false);
});

test("with a caption page, the caption goes there and not onto the phone", async () => {
  const phone = await open("phone");
  const side = await open("desktop");
  const stage = await attachStage(phone, "phone", { captionPage: side });
  await stage.caption("הלקוח פותח את הקישור");
  assert.equal(await cap(side).textContent(), "הלקוח פותח את הקישור");
  assert.equal(await cap(side).getAttribute("dir"), "rtl");
  assert.equal((await cap(phone).textContent()) ?? "", "");
  // the side caption must stay clear of the area the phone clip is composited onto
  const box = (await cap(side).boundingBox())!;
  assert.ok(box.x + box.width <= 760, `caption reaches x=${box.x + box.width}`);
});

test("the cursor still lives on the phone page when captions are elsewhere", async () => {
  const phone = await open("phone");
  const side = await open("desktop");
  const stage = await attachStage(phone, "phone", { captionPage: side });
  await stage.click(phone.getByRole("button", { name: "אישור" }));
  assert.equal(await phone.title(), "clicked");
  assert.equal(await phone.locator("[data-stage-cursor][data-on]").count(), 1);
});
