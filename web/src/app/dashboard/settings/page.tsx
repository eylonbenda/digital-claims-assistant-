import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_TITLE } from "@/lib/dashboard/copy";
import BusinessDetails from "../BusinessDetails";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Own row via RLS.
  const { data: me } = await supabase
    .from("agents")
    .select("name, phone, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-extrabold text-ink">{SETTINGS_TITLE}</h1>
      <BusinessDetails
        initial={{ name: me?.name ?? null, phone: me?.phone ?? null, email: me?.email ?? null }}
      />
    </main>
  );
}
