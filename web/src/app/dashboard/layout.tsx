import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SidebarNav from "./SidebarNav";

// Shared shell for every /dashboard route: a fixed sidebar (inline-start, i.e. the
// right edge in RTL) on wide screens, collapsing to a slim top bar on narrow ones.
// Pages render only their own <main>.
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="app-shell min-h-screen bg-canvas text-ink lg:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-line bg-white lg:flex">
        <Link href="/dashboard" className="px-5 pb-4 pt-5">
          <Image
            src="/brand/logo.svg"
            alt="OpenTik"
            width={150}
            height={40}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <div className="px-5 pb-2 text-xs text-muted">סביבת עבודה</div>
        <SidebarNav />

        <div className="mt-auto border-t border-line p-4">
          <div className="truncate text-xs text-muted" dir="ltr" title={user.email ?? undefined}>
            {user.email}
          </div>
          <LogoutButton className="mt-2 w-full" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
          <Link href="/dashboard">
            <Image
              src="/brand/logo.svg"
              alt="OpenTik"
              width={150}
              height={40}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <div className="flex items-center gap-2">
            <SidebarNav compact />
            <LogoutButton />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className={`rounded-lg border border-line px-3 py-1.5 text-sm text-ink/70 hover:bg-canvas ${className}`}
      >
        התנתקות
      </button>
    </form>
  );
}
