"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CLAIMS_TITLE, OVERVIEW_TITLE, SETTINGS_TITLE } from "@/lib/dashboard/copy";
import { EMAIL_COPY } from "@/lib/email/copy";

const INBOX_HREF = "/dashboard/inbox";

// One entry per top-level dashboard route. A claim page (/dashboard/<id>) belongs
// to "תיקים": it is active on any /dashboard path no other entry claims.
const ITEMS = [
  { href: "/dashboard", label: CLAIMS_TITLE, icon: FolderIcon },
  { href: INBOX_HREF, label: EMAIL_COPY.inboxTitle, icon: MailIcon },
  { href: "/dashboard/overview", label: OVERVIEW_TITLE, icon: ChartIcon },
  { href: "/dashboard/settings", label: SETTINGS_TITLE, icon: GearIcon },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href !== "/dashboard") return pathname === href || pathname.startsWith(`${href}/`);
  return !ITEMS.some((i) => i.href !== "/dashboard" && isActive(i.href, pathname));
}

// `compact` is the narrow-screen top bar: a horizontal row, labels only.
// `inbox` is the number of unfiled messages, or null when email is off for this
// business — the entry is then hidden.
export default function SidebarNav({
  compact = false,
  inbox = null,
}: {
  compact?: boolean;
  inbox?: number | null;
}) {
  const pathname = usePathname();

  return (
    <nav className={compact ? "flex items-center gap-1" : "flex flex-col gap-1 px-3"}>
      {ITEMS.filter((i) => i.href !== INBOX_HREF || inbox !== null).map(({ href, label, icon: Icon }) => {
        const active = isActive(href, pathname);
        const count = href === INBOX_HREF ? (inbox ?? 0) : 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-brand-soft text-brand" : "text-ink/70 hover:bg-canvas hover:text-ink"
            }`}
          >
            {!compact && <Icon />}
            {label}
            {count > 0 && (
              <span className="ms-auto rounded-full bg-brand px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
