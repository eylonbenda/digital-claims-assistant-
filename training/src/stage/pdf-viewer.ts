import type { Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { TRAINING_ROOT } from "../env.ts";
import type { Stage } from "./stage.ts";

// Headless Chromium has no PDF viewer, so the filled form is shown by rendering the real
// PDF bytes with pdf.js in a plain page. Files are served to the page from disk through
// a route on a made-up origin — nothing leaves the machine.
const ORIGIN = "http://training.local";
const PDFJS = path.join(TRAINING_ROOT, "node_modules", "pdfjs-dist", "build");

const VIEWER = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#3c4a60;display:flex;flex-direction:column;align-items:center;gap:18px;padding:22px 0 140px}
  canvas{background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35)}
</style></head><body><script type="module">
  import * as pdfjs from "/pdf.min.mjs";
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  try {
    const doc = await pdfjs.getDocument({ url: "/doc.pdf" }).promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n);
      const vp = pg.getViewport({ scale: 1.55 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      document.body.appendChild(c);
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    }
    window.__pdfPages = doc.numPages;
  } catch (e) { window.__pdfError = String(e); }
</script></body></html>`;

/** Renders every page of the PDF, then scrolls slowly from top to bottom. */
export async function showPdf(page: Page, pdfPath: string, stage: Stage, scrollMs = 8000): Promise<void> {
  const files: Record<string, { body: Buffer | string; contentType: string }> = {
    "/viewer.html": { body: VIEWER, contentType: "text/html; charset=utf-8" },
    "/pdf.min.mjs": { body: fs.readFileSync(path.join(PDFJS, "pdf.min.mjs")), contentType: "text/javascript" },
    "/pdf.worker.min.mjs": { body: fs.readFileSync(path.join(PDFJS, "pdf.worker.min.mjs")), contentType: "text/javascript" },
    "/doc.pdf": { body: fs.readFileSync(pdfPath), contentType: "application/pdf" },
  };
  await page.route(`${ORIGIN}/**`, (route) => {
    const hit = files[new URL(route.request().url()).pathname];
    return hit ? route.fulfill({ body: hit.body, contentType: hit.contentType }) : route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`${ORIGIN}/viewer.html`);
  await page.waitForFunction("window.__pdfPages || window.__pdfError", undefined, { timeout: 30_000 });
  const error = await page.evaluate("window.__pdfError || ''");
  if (error) throw new Error(`pdf viewer: ${error}`);
  await stage.hold(1500);
  // Smooth scroll to the bottom, driven from Node so the pace is the same on any machine.
  const max = Number(await page.evaluate("document.documentElement.scrollHeight - window.innerHeight"));
  const ticks = Math.max(1, Math.round(scrollMs / 40));
  for (let i = 1; i <= ticks; i++) {
    await page.evaluate(`window.scrollTo(0, ${Math.round((max * i) / ticks)})`);
    await page.waitForTimeout(40);
  }
  await stage.hold(1200);
}
