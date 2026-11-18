import type { Env } from "./env.ts";

// The recorder creates and deletes claims. This is the gate that keeps it on a local
// app backed by the dev database — see the spec's anti-goals.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const norm = (u: string) => u.trim().toLowerCase().replace(/\/+$/, "");

export function checkTarget(i: {
  baseUrl: string;
  versionEnv: string | null;
  supabaseUrl: string;
  prodSupabaseUrl: string | null;
}): { ok: true } | { ok: false; reason: string } {
  let host: string;
  try {
    host = new URL(i.baseUrl).hostname;
  } catch {
    return { ok: false, reason: `BASE_URL is not a URL: ${i.baseUrl}` };
  }
  if (!LOCAL_HOSTS.has(host)) {
    return { ok: false, reason: `refusing to record against non-local host ${host} — BASE_URL must be localhost` };
  }
  if (i.prodSupabaseUrl && norm(i.prodSupabaseUrl) === norm(i.supabaseUrl)) {
    return { ok: false, reason: "SUPABASE_URL in training/.env.local is the PROD project — refusing" };
  }
  if (i.versionEnv === null) {
    return { ok: false, reason: `no app at ${i.baseUrl} — start it first (see training/README.md)` };
  }
  if (i.versionEnv === "production") {
    return { ok: false, reason: `the app at ${i.baseUrl} reports env=production — refusing` };
  }
  return { ok: true };
}

export async function assertSafeTarget(env: Env): Promise<void> {
  let versionEnv: string | null = null;
  try {
    const res = await fetch(`${env.baseUrl}/api/version`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) versionEnv = String(((await res.json()) as { env?: unknown }).env ?? "unknown");
  } catch {
    versionEnv = null;
  }
  const r = checkTarget({ baseUrl: env.baseUrl, versionEnv, supabaseUrl: env.supabaseUrl, prodSupabaseUrl: env.prodSupabaseUrl });
  if (!r.ok) throw new Error(r.reason);
}
