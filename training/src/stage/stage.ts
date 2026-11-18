import type { Locator, Page } from "playwright";
import { overlayScript } from "./overlay.ts";
import { holdMs } from "./pacing.ts";

export type Surface = "desktop" | "phone";

export type Stage = {
  /** Full-frame chapter card. */
  titleCard(text: string, ms?: number): Promise<void>;
  /** Shows the caption; does not wait. Empty string hides it. */
  caption(text: string): Promise<void>;
  /** Waits; by default long enough to read the current caption. */
  hold(ms?: number): Promise<void>;
  /** Scrolls the target into view, glides the cursor to it, ripples, then really clicks. */
  click(target: Locator): Promise<void>;
  /** Clicks the field, then types at a readable speed. */
  type(target: Locator, text: string): Promise<void>;
  /** Draws a ring around the element without clicking it. */
  highlight(target: Locator, ms?: number): Promise<void>;
};

const call = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(`window.__stage && window.__stage.${fn}(${args.map((a) => JSON.stringify(a)).join(",")})`).catch(() => undefined);

export async function attachStage(page: Page, surface: Surface): Promise<Stage> {
  const script = overlayScript(surface);
  let current = "";
  await page.addInitScript({ content: script });
  await page.evaluate(script).catch(() => undefined); // the document that is already open
  // A full navigation gives a fresh overlay: put the caption back.
  page.on("domcontentloaded", () => { if (current) void call(page, "caption", current); });

  const centre = async (target: Locator) => {
    await target.scrollIntoViewIfNeeded();
    // Scrolling an element into view can pan a slightly-too-wide page sideways; the
    // recording must stay flush with the reading edge.
    await page.evaluate("window.scrollTo(0, window.scrollY)").catch(() => undefined);
    const box = await target.boundingBox();
    if (!box) throw new Error("stage: target has no box (not visible)");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  };

  const stage: Stage = {
    async titleCard(text, ms = 2500) {
      await call(page, "title", text);
      await page.waitForTimeout(ms);
      await call(page, "title", "");
    },
    async caption(text) {
      current = text;
      await call(page, "caption", text);
    },
    async hold(ms) {
      await page.waitForTimeout(ms ?? holdMs(current));
    },
    async click(target) {
      const { x, y } = await centre(target);
      await call(page, "cursor", x, y);
      await page.waitForTimeout(650);
      await call(page, "ripple", x, y);
      await target.click();
      await page.waitForTimeout(250);
    },
    async type(target, text) {
      await stage.click(target);
      await target.pressSequentially(text, { delay: 60 });
      await page.waitForTimeout(200);
    },
    async highlight(target, ms = 1600) {
      const { x, y, box } = await centre(target);
      await call(page, "cursor", x, y);
      await call(page, "ring", box);
      await page.waitForTimeout(ms);
      await call(page, "ring", null);
    },
  };
  return stage;
}
