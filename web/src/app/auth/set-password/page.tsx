import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "../AuthCard";
import { SetPasswordForm } from "./SetPasswordForm";

// Reached right after /auth/confirm signs the user in from an email link.
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AuthCard title="בחירת סיסמה" subtitle={user.email ?? undefined}>
      <SetPasswordForm />
    </AuthCard>
  );
}
