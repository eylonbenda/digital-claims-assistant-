import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewClaimForm from "./NewClaimForm";
import ClaimsTable from "./ClaimsTable";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: claims } = await supabase
    .from("claims")
    .select(
      "id, client_name, client_phone, claim_type, status, urgent, created_at, submitted_at, access_token"
    )
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900">עוזר התביעות</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">תביעות</h2>
          <NewClaimForm />
        </div>

        <ClaimsTable claims={claims ?? []} />
      </main>
    </div>
  );
}

function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
      >
        התנתקות
      </button>
    </form>
  );
}
