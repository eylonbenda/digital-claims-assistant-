import { createClient } from "@/lib/supabase/server";

// Sends a password-reset email. Always answers ok — whether an address has an
// account must not be discoverable from this endpoint.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return Response.json({ error: "email required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error("[auth/forgot] resetPasswordForEmail failed:", error.message);

  return Response.json({ ok: true });
}
