import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_TITLE } from "@/lib/dashboard/copy";
import BusinessDetails from "../BusinessDetails";
import EmailSetup from "./EmailSetup";
import { emailTime } from "@/lib/email/copy";
import { loadEmailFeature } from "@/lib/email/load";
import { insurerDomains } from "@/lib/submission/directory";

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

  // Email block: only when the feature is on for this business.
  const email = await loadEmailFeature(supabase, user.id);
  let lastReceived: string | null = null;
  if (email) {
    const { data: last } = await supabase
      .from("claim_emails")
      .select("received_at")
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastReceived = last ? emailTime(last.received_at as string, new Date()) : null;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-extrabold text-ink">{SETTINGS_TITLE}</h1>
      <BusinessDetails
        initial={{ name: me?.name ?? null, phone: me?.phone ?? null, email: me?.email ?? null }}
      />
      {email && (
        <EmailSetup
          address={email.address}
          // Until one is saved, the business's contact address is the suggestion.
          claimsMailbox={email.claimsMailbox ?? me?.email ?? ""}
          lastReceived={lastReceived}
          insurerDomains={[...new Set(insurerDomains())].sort()}
        />
      )}
    </main>
  );
}
