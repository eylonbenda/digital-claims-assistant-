"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLAIMS_TITLE, CLAIM_CRUMB, OVERVIEW_TITLE, SETTINGS_TITLE } from "@/lib/dashboard/copy";
import NewClaimForm from "./NewClaimForm";

type Crumb = { label: string; href?: string };

// Where the user is, from the path alone — the layout does not re-render on
// navigation, so this has to be a client component.
function crumbs(pathname: string): Crumb[] {
  if (pathname === "/dashboard") return [{ label: CLAIMS_TITLE }];
  if (pathname.startsWith("/dashboard/settings")) return [{ label: SETTINGS_TITLE }];
  if (pathname.startsWith("/dashboard/overview")) return [{ label: OVERVIEW_TITLE }];
  return [{ label: CLAIMS_TITLE, href: "/dashboard" }, { label: CLAIM_CRUMB }];
}

// Wide screens only; narrow screens keep the compact header in the layout.
export default function TopBar() {
  const trail = crumbs(usePathname());

  return (
    <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-line bg-white px-6 lg:flex">
      <nav aria-label="מיקום" className="flex min-w-0 items-center gap-2 text-sm">
        <span className="text-muted">OpenTik</span>
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <span key={c.label} className="flex items-center gap-2">
              <Chevron />
              {c.href && !last ? (
                <Link href={c.href} className="text-muted hover:text-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="font-semibold text-ink" aria-current="page">
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <NewClaimForm />
    </header>
  );
}

// Points toward the next crumb, which in RTL is to the left.
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted"
      aria-hidden="true"
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}
