import { createClient } from "@/lib/supabase/server";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

// Sets the password of the signed-in user. The session comes from the invite /
// reset link (see ../confirm), so no "current password" is asked for.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: "weak_password" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "no_session" }, { status: 401 });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase rejects reusing the current password and passwords below its own policy.
    const code = error.code === "same_password" ? "same_password" : "weak_password";
    return Response.json({ error: code }, { status: 400 });
  }

  return Response.json({ ok: true });
}
