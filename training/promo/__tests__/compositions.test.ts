import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { beatsFor, type Cut } from "../beats.ts";
import { AUDIENCES, resolveCopy, type PromoCopy } from "../copy.ts";
import { compose } from "../compositions/index.ts";
import { safeRect, type BeatProps, type CaptureRef } from "../compositions/layout.ts";
import { CAPTURE_IDS, type CaptureId } from "../manifest.ts";
import { frameAt, prepare } from "../renderer.ts";
import { RATIOS, SIZE, type Ratio } from "../timeline.ts";

let browser: Browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

// A 1x1 grey pixel stands in for every capture; only its declared size matters to layout.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8e/fufwAIkgNmFkKrVQAAAABJRU5ErkJggg==";
const dims = (id: CaptureId) => (id === "pdf-page-1" ? { width: 1488, height: 2104 } : id.startsWith("client") ? { width: 780, height: 1560 } : { width: 2560, height: 1600 });
const captures = Object.fromEntries(CAPTURE_IDS.map((id) => [id, { src: PIXEL, ...dims(id), points: { answer: { x: 0.5, y: 0.32 }, next: { x: 0.4, y: 0.89 }, claim: { x: 0.73, y: 0.4 }, generate: { x: 0.48, y: 0.64 } } }])) as unknown as Record<CaptureId, CaptureRef>;
const insurers = ["הראל", "מגדל", "הפניקס", "מנורה", "איילון", "הכשרה", "שלמה", "ליברה", "AIG"];

const longer = (s: string) => s + " " + s.slice(0, Math.ceil(s.length * 0.25));
function stretched(c: PromoCopy): PromoCopy {
  return {
    ...c, hook: longer(c.hook), outcome: longer(c.outcome), turn: longer(c.turn), client: longer(c.client),
    caseFile: longer(c.caseFile), form: longer(c.form), ctaText: longer(c.ctaText),
    tagline: c.tagline.map(longer), chat: c.chat.map(longer),
  };
}

// Runs in the page: every problem with the copy that is on screen at this moment.
const check = (safe: { x: number; y: number; width: number; height: number }) => `(() => {
  const safe = ${JSON.stringify(safe)};
  const shown = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o > 0.05; };
  const name = (el) => el.dataset.copy || el.dataset.frame || "?";
  const copy = [...document.querySelectorAll("[data-copy]")].filter(shown);
  const frames = [...document.querySelectorAll("[data-frame]")].filter(shown);
  const out = [];
  if (copy.length === 0) out.push("no copy on screen");
  for (const el of copy) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) out.push("empty: " + name(el));
    if (r.left < safe.x - 1 || r.top < safe.y - 1 || r.right > safe.x + safe.width + 1 || r.bottom > safe.y + safe.height + 1) out.push("outside the safe area: " + name(el));
    if (el.scrollWidth > el.clientWidth + 1) out.push("clipped: " + name(el));
    if (!el.hasAttribute("data-ltr") && getComputedStyle(el).direction !== "rtl") out.push("not rtl: " + name(el));
  }
  const all = [...copy, ...frames];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (a.hasAttribute("data-frame") && b.hasAttribute("data-frame")) continue;
    const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
    if (x.left < y.right - 1 && y.left < x.right - 1 && x.top < y.bottom - 1 && y.top < x.bottom - 1) out.push("overlap: " + name(a) + " / " + name(b));
  }
  return out;
})()`;

async function problems(props: BeatProps, id: Parameters<typeof compose>[0], atFraction: number): Promise<string[]> {
  const page = await browser.newPage();
  try {
    const comp = compose(id, props);
    await prepare(page, comp, props.ratio);
    await frameAt(page, comp.durationMs * atFraction);
    const size = await page.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]") as number[];
    const found = (await page.evaluate(check(safeRect(props.ratio)))) as string[];
    if (size[0] > SIZE[props.ratio].width || size[1] > SIZE[props.ratio].height) found.push(`page larger than the frame: ${size.join("x")}`);
    return found;
  } finally {
    await page.close();
  }
}

const cases: { cut: Cut; ratio: Ratio }[] = [
  ...RATIOS.map((ratio) => ({ cut: "full" as Cut, ratio })),
  { cut: "short", ratio: "9x16" }, { cut: "short", ratio: "1x1" },
];

for (const { cut, ratio } of cases) {
  for (const variant of ["as written", "25% longer"] as const) {
    test(`${cut} cut, ${ratio}, copy ${variant}: copy is on screen, inside the safe area, and clear of the picture`, async () => {
      for (const audience of AUDIENCES) {
        const copy = variant === "as written" ? resolveCopy(audience) : stretched(resolveCopy(audience));
        for (const beat of beatsFor(cut)) {
          const props: BeatProps = { audience, cut, ratio, durationMs: beat.durationMs, copy, captures, insurers };
          // Mid-beat, and the last frame (where every line has arrived).
          for (const at of [0.6, 0.999]) {
            assert.deepEqual(await problems(props, beat.id, at), [], `${audience} ${beat.id} at ${at}`);
          }
        }
      }
    });
  }
}

test("the short cut's end card carries the outcome line, the full cut's does not", () => {
  const base = { audience: "garage" as const, ratio: "9x16" as Ratio, durationMs: 4500, copy: resolveCopy("garage"), captures, insurers };
  const outcome = resolveCopy("garage").outcome.split(". ")[0];
  assert.ok(compose("endCard", { ...base, cut: "short" }).html.includes(outcome));
  assert.ok(!compose("endCard", { ...base, cut: "full" }).html.includes(outcome));
});

test("the garage version's own words never say agent", () => {
  for (const cut of ["full", "short"] as const) {
    for (const beat of beatsFor(cut)) {
      const html = compose(beat.id, { audience: "garage", cut, ratio: "1x1", durationMs: beat.durationMs, copy: resolveCopy("garage"), captures, insurers }).html;
      const words = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
      assert.ok(!words.includes("סוכן"), beat.id);
    }
  }
});

test("a beat's duration is the one it was given", () => {
  const c = compose("turn", { audience: "agent", cut: "full", ratio: "16x9", durationMs: 3000, copy: resolveCopy("agent"), captures, insurers });
  assert.equal(c.durationMs, 3000);
});
