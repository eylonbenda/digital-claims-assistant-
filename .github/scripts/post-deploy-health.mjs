// Post-deploy health check — see .github/workflows/post-deploy-health.yml.
//
// Curls <deployment>/api/health after Vercel reports a successful deploy. The
// endpoint is 503 when the live DB is missing a migration this build expects,
// so this is what catches "merged, deployed green, migration never pasted".
//
// Vercel's per-deployment URLs (the event's environment_url) sit behind Vercel
// Deployment Protection (302 → vercel.com/sso-api). Two ways through:
//   1. secret VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings → Deployment
//      Protection → Protection Bypass for Automation) → sent as the
//      x-vercel-protection-bypass header. Works for Production and Preview.
//   2. Production only: repo variable PROD_BASE_URL (the public prod domain).
//      We first poll its /api/version until it serves this deployment's commit,
//      so we never green-light the previous build.
//
// Production failures fail the job; Preview failures are warnings only.

const env = process.env;
const ENVIRONMENT = env.DEPLOY_ENVIRONMENT ?? "";
const IS_PROD = ENVIRONMENT === "Production";
const ENV_URL = (env.DEPLOY_URL ?? "").replace(/\/+$/, "");
const SHA = (env.DEPLOY_SHA ?? "").slice(0, 7);
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const PROD_BASE_URL = (env.PROD_BASE_URL ?? "").replace(/\/+$/, "");
const ATTEMPTS = Number(env.ATTEMPTS ?? 5);
const DELAY_MS = Number(env.DELAY_MS ?? 10_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  if (IS_PROD) {
    console.log(`::error title=Post-deploy health (${ENVIRONMENT})::${msg}`);
    process.exit(1);
  }
  console.log(`::warning title=Post-deploy health (${ENVIRONMENT})::${msg}`);
  process.exit(0);
}

async function get(url) {
  const headers = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};
  try {
    const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    return { status: res.status, body: await res.text(), location: res.headers.get("location") ?? "" };
  } catch (err) {
    return { status: 0, body: String(err?.message ?? err), location: "" };
  }
}

const isSsoWall = (r) => r.status === 401 || (r.status >= 300 && r.status < 400 && /vercel\.com\/sso/.test(r.location));

async function main() {
  let base = ENV_URL;
  if (!BYPASS && IS_PROD && PROD_BASE_URL) {
    base = PROD_BASE_URL;
    console.log(`No bypass secret — checking ${base} once it serves commit ${SHA}.`);
    let live = "";
    for (let i = 1; i <= ATTEMPTS; i++) {
      const r = await get(`${base}/api/version`);
      try { live = JSON.parse(r.body).commit ?? ""; } catch { live = ""; }
      if (live === SHA) break;
      console.log(`  attempt ${i}/${ATTEMPTS}: /api/version commit=${live || `(HTTP ${r.status})`}, waiting…`);
      if (i < ATTEMPTS) await sleep(DELAY_MS);
    }
    if (live !== SHA) fail(`${base} never served commit ${SHA} (last saw "${live}") — alias not updated?`);
  }
  if (!base) fail("deployment_status event carried no environment_url/target_url.");

  const url = `${base}/api/health`;
  let last;
  for (let i = 1; i <= ATTEMPTS; i++) {
    last = await get(url);
    console.log(`attempt ${i}/${ATTEMPTS}: GET ${url} → HTTP ${last.status}`);
    if (last.status === 200) {
      console.log(last.body);
      return;
    }
    if (isSsoWall(last)) {
      fail(
        `${url} is behind Vercel Deployment Protection (HTTP ${last.status}). Add the ` +
          "VERCEL_AUTOMATION_BYPASS_SECRET repo secret" + (IS_PROD ? " or the PROD_BASE_URL repo variable." : "."),
      );
    }
    if (i < ATTEMPTS) await sleep(DELAY_MS);
  }
  console.log(last.body);
  fail(`${url} returned HTTP ${last.status} after ${ATTEMPTS} attempts: ${last.body.slice(0, 500)}`);
}

await main();
