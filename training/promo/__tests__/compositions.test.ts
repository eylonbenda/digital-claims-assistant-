import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { beatsFor, totalMs, type Cut } from "../beats.ts";
import { AUDIENCES, resolveCopy, type PromoCopy } from "../copy.ts";
import { compose, film } from "../compositions/index.ts";
import { safeRect, type BeatProps, type CaptureRef } from "../compositions/layout.ts";
import { CAPTURE_IDS, type CaptureId } from "../manifest.ts";
import { frameAt, prepare } from "../renderer.ts";
import { RATIOS, SIZE, type Ratio } from "../timeline.ts";

let browser: Browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

// A 1x1 grey pixel stands in for every capture; only its declared size and marks matter to layout.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8e/fufwAIkgNmFkKrVQAAAABJRU5ErkJggg==";
const mark = (x: number, y: number, w: number, h: number, px = 14) => ({ x, y, w, h, px });
const SHAPE: Record<CaptureId, Omit<CaptureRef, "src">> = {
  "client-question": { width: 960, height: 1920, cssWidth: 320, marks: { question: mark(0.06, 0.19, 0.88, 0.05, 24), answer: mark(0.06, 0.35, 0.88, 0.08, 16) } },
  ...Object.fromEntries([0, 1, 2, 3].map((n) => [`client-docs-${n}`, {
    width: 960, height: 2700, cssWidth: 320,
    marks: { licence: mark(0.1, 0.33, 0.3, 0.05), registration: mark(0.1, 0.52, 0.3, 0.05), photos: mark(0.1, 0.66, 0.3, 0.05), next: mark(0.06, 0.86, 0.62, 0.06, 18) },
  }])) as unknown as Record<"client-docs-0" | "client-docs-1" | "client-docs-2" | "client-docs-3", Omit<CaptureRef, "src">>,
  "client-sent": { width: 960, height: 1920, cssWidth: 320, marks: { title: mark(0.08, 0.14, 0.85, 0.1, 24) } },
  "case-overview": { width: 1300, height: 4000, cssWidth: 520, marks: { name: mark(0.8, 0.08, 0.12, 0.02, 24), tabs: mark(0.04, 0.18, 0.92, 0.02), verdict: mark(0.07, 0.6, 0.86, 0.013, 16) } },
  "case-files": { width: 1300, height: 2600, cssWidth: 520, marks: { name: mark(0.8, 0.12, 0.12, 0.03, 24), tabs: mark(0.04, 0.27, 0.92, 0.03) } },
  "form-tab": { width: 1300, height: 6000, cssWidth: 520, marks: { name: mark(0.8, 0.05, 0.12, 0.01, 24), tabs: mark(0.04, 0.11, 0.92, 0.014), filled: mark(0.04, 0.15, 0.92, 0.024), generate: mark(0.17, 0.18, 0.32, 0.011) } },
  "pdf-page-1": { width: 1488, height: 2104, cssWidth: 595 },
};
const captures = Object.fromEntries(CAPTURE_IDS.map((id) => [id, { src: PIXEL, ...SHAPE[id] }])) as Record<CaptureId, CaptureRef>;
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

// A crop must never show what the capture marked as off limits.
const marked = (what: "login" | "agent-word") => ({
  ...captures,
  "pdf-page-1": { ...captures["pdf-page-1"], avoid: [{ what, x: 0.6, y: 0.3, w: 0.05, h: 0.03 }] },
});
const caseProps = (audience: "garage" | "agent", caps: Record<CaptureId, CaptureRef>): BeatProps =>
  ({ audience, cut: "full", ratio: "1x1", durationMs: 6000, copy: resolveCopy(audience), captures: caps, insurers });

test("a crop that would show the demo login is refused for both audiences", () => {
  for (const audience of AUDIENCES) assert.throws(() => compose("form", caseProps(audience, marked("login"))), /pdf-page-1.*login/);
});

test("a crop that would show the word for agent is refused in the garage version only", () => {
  assert.throws(() => compose("form", caseProps("garage", marked("agent-word"))), /pdf-page-1.*agent-word/);
  assert.doesNotThrow(() => compose("form", caseProps("agent", marked("agent-word"))));
});

test("a marked region outside the crop is fine", () => {
  const caps = { ...captures, "pdf-page-1": { ...captures["pdf-page-1"], avoid: [{ what: "login" as const, x: 0.2, y: 0.3, w: 0.2, h: 0.03 }] } };
  assert.doesNotThrow(() => compose("form", caseProps("garage", caps)));
});

// ── The real app, readable; soft joins ────────────────────────────────────────────────
const filmProps = (cut: Cut, ratio: Ratio) => ({ audience: "garage" as const, cut, ratio, copy: resolveCopy("garage"), captures, insurers });

// Runs in the page: the captures on screen whose text, at the size they are shown, is
// smaller than a viewer can read on a phone; and anything inside a screen that is not a
// capture of the app (only a marked overlay may be drawn over one).
const screens = (minPx: number) => `(() => {
  const shown = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o > 0.05; };
  const shots = [...document.querySelectorAll("[data-frame] [data-shot]")].filter(shown);
  const size = (el) => el.querySelector("img").getBoundingClientRect().width / Number(el.dataset.cssWidth) * Number(el.dataset.px);
  const small = shots.filter((el) => !(size(el) >= ${minPx})).map((el) => el.dataset.shot + " " + Math.round(size(el)) + "px");
  const drawn = [...document.querySelectorAll("[data-frame] img, [data-frame] [data-t]")]
    .filter((el) => (el.matches("[data-t]") ? !el.closest("[data-overlay]") : !el.closest("[data-shot]")))
    .map((el) => el.tagName + " " + (el.textContent || "").trim().slice(0, 24));
  const tiny = [...document.querySelectorAll("[data-overlay] [data-t]")].filter(shown).filter((el) => parseFloat(getComputedStyle(el).fontSize) < ${minPx}).map((el) => el.textContent.trim().slice(0, 24));
  return { count: shots.length, small, drawn, tiny };
})()`;

for (const ratio of RATIOS) {
  test(`product screens, ${ratio}: every screen is a capture of the app, shown large enough to read`, async () => {
    const minPx = Math.min(SIZE[ratio].width, SIZE[ratio].height) * 0.021;
    for (const id of ["client", "caseFile", "form", "montage"] as const) {
      const page = await browser.newPage();
      try {
        const comp = compose(id, { ...filmProps(id === "montage" ? "short" : "full", ratio), durationMs: id === "montage" ? 8000 : 6000 });
        await prepare(page, comp, ratio);
        for (const at of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
          await frameAt(page, comp.durationMs * at);
          const r = (await page.evaluate(screens(minPx))) as { count: number; small: string[]; drawn: string[]; tiny: string[] };
          assert.ok(r.count > 0, `${id} at ${at}: no capture on screen`);
          assert.deepEqual(r.small, [], `${id} at ${at}: too small`);
          assert.deepEqual(r.drawn, [], `${id} at ${at}: not a capture`);
          assert.deepEqual(r.tiny, [], `${id} at ${at}: overlay text too small`);
        }
      } finally { await page.close(); }
    }
  });
}

test("the film is one piece as long as its beats", () => {
  for (const cut of ["full", "short"] as const) assert.equal(film(filmProps(cut, "16x9")).durationMs, totalMs(cut));
});

// Runs in the page: how strongly each beat's own content shows right now.
const strengths = `(() => Object.fromEntries([...document.querySelectorAll("[data-beat]")].map((b) => {
  const body = b.querySelector("[data-body]");
  return [b.dataset.beat, parseFloat(getComputedStyle(b).opacity) * parseFloat(getComputedStyle(body).opacity)];
})))()`;

test("no hard cut: a beat's content has left before the next beat starts, and was whole shortly before", async () => {
  const page = await browser.newPage();
  try {
    const comp = film(filmProps("full", "16x9"));
    await prepare(page, comp, "16x9");
    const now = async () => (await page.evaluate(strengths)) as Record<string, number>;
    const beats = beatsFor("full");
    let t = 0;
    for (let i = 0; i < beats.length - 1; i++) {
      t += beats[i].durationMs;
      await frameAt(page, t - 600);
      assert.ok((await now())[beats[i].id] > 0.95, `${beats[i].id} still whole 0.6s before its end`);
      await frameAt(page, t - 1);
      assert.ok((await now())[beats[i].id] < 0.05, `${beats[i].id} has left by its end`);
      await frameAt(page, t + 400);
      assert.ok((await now())[beats[i + 1].id] > 0.95, `${beats[i + 1].id} is up`);
    }
  } finally { await page.close(); }
});

test("inside the film every beat still keeps its copy in the safe area", async () => {
  for (const { cut, ratio } of cases) {
    const page = await browser.newPage();
    try {
      const comp = film(filmProps(cut, ratio));
      await prepare(page, comp, ratio);
      let t0 = 0;
      for (const beat of beatsFor(cut)) {
        await frameAt(page, t0 + beat.durationMs * 0.6);
        // Only the beat that is playing counts: the others are covered or not yet shown.
        const scoped = check(safeRect(ratio)).split("document.querySelectorAll(\"[data-").join(`document.querySelectorAll("[data-beat=${beat.id}] [data-`);
        assert.deepEqual((await page.evaluate(scoped)) as string[], [], `${cut} ${ratio} ${beat.id}`);
        t0 += beat.durationMs;
      }
    } finally { await page.close(); }
  }
});
