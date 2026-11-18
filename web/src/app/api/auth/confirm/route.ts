import { createClient } from "@/lib/supabase/server";

// Email-link types this app issues: a dashboard invite, and a password reset.
const ALLOWED_TYPES = ["invite", "recovery"] as const;
type LinkType = (typeof ALLOWED_TYPES)[number];

// Exchanges the one-time token from an invite / reset email for a session.
// POST on purpose: the email links to /auth/confirm, which only renders a button.
// Mail scanners and link previewers GET every URL in a message — if the GET itself
// consumed the token, the real click would land on "otp_expired".
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tokenHash = typeof body?.token_hash === "string" ? body.token_hash : "";
  const type = body?.type as LinkType;

  if (!tokenHash || !ALLOWED_TYPES.includes(type)) {
    return Response.json({ error: "invalid_link" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return Response.json({ error: "expired_link" }, { status: 401 });

  return Response.json({ ok: true });
}
