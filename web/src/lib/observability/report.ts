// Server-side error reporting: one structured log line per failure (Vercel logs), plus
// an optional push alert so a pilot breakage reaches the developer before the garage
// has to call. Deliberately dependency-free.
//
// ALERT_WEBHOOK_URL — optional. Receives POST {text, content} (Slack reads `text`,
// Discord `content`; Telegram's sendMessage?chat_id=… reads `text`). Alerts are sent
// only from VERCEL_ENV=production so previews against the dev DB don't page anyone.
//
// Never put request paths, tokens, bodies or claimant data in here: `where` is a route
// *pattern* (/c/[token], not /c/<token>) and ctx is ids only.

const MAX_MESSAGE = 300;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // per `where`, per instance — an outage pages once
const ALERT_TIMEOUT_MS = 3000;

const lastAlertAt = new Map<string, number>();

export type ErrorContext = Record<string, string | number | undefined>;

export function errorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  return raw.length > MAX_MESSAGE ? `${raw.slice(0, MAX_MESSAGE)}…` : raw;
}

export function shouldAlert(
  where: string,
  now: number,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!env.ALERT_WEBHOOK_URL || env.VERCEL_ENV !== "production") return false;
  const last = lastAlertAt.get(where);
  if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(where, now);
  return true;
}

export async function reportError(where: string, err: unknown, ctx: ErrorContext = {}): Promise<void> {
  const message = errorMessage(err);
  console.error(
    JSON.stringify({ level: "error", where, message, ...ctx, env: process.env.VERCEL_ENV ?? "local" }),
  );

  if (!shouldAlert(where, Date.now())) return;
  const details = Object.entries(ctx)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const text = `🔴 prod error at ${where}\n${message}${details ? `\n${details}` : ""}`;
  try {
    await fetch(process.env.ALERT_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", where: "alert-webhook", message: errorMessage(e) }));
  }
}

// For route handlers: report, then answer with a generic 500. The raw DB/storage
// message stays in the log — it's noise to the user and can leak schema details.
export async function serverError(where: string, err: unknown, ctx: ErrorContext = {}): Promise<Response> {
  await reportError(where, err, ctx);
  return Response.json({ error: "שגיאת שרת — נסו שוב בעוד רגע" }, { status: 500 });
}
