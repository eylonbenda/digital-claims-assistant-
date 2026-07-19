import Link from "next/link";
import type { DigestGroup } from "@/lib/tasks/digest";

// "מעקבים להיום" — the agent's day in one section: every due/overdue task
// across all claims, most urgent claim first. Hidden entirely when empty.
export default function FollowupsPanel({ groups }: { groups: DigestGroup[] }) {
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
      <h3 className="text-base font-bold text-orange-900">
        מעקבים להיום ({total})
      </h3>
      <div className="mt-3 space-y-3">
        {groups.map((g) => (
          <div key={g.claim.id} className="rounded-lg border border-orange-100 bg-white p-3">
            <Link
              href={`/dashboard/${g.claim.id}`}
              className="text-sm font-semibold text-zinc-900 hover:underline"
            >
              {g.claim.client_name ?? "ללא שם"}
            </Link>
            <ul className="mt-1.5 space-y-1.5">
              {g.entries.map((e) => (
                <li key={e.task.id} className="flex flex-wrap items-center gap-2 text-sm">
                  {e.daysOverdue > 0 ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      באיחור {e.daysOverdue === 1 ? "יום" : `${e.daysOverdue} ימים`}
                    </span>
                  ) : (
                    <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                      להיום
                    </span>
                  )}
                  <span className="text-zinc-700">{e.task.title}</span>
                  {e.waHref && (
                    <a
                      href={e.waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-800"
                    >
                      וואטסאפ ללקוח ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
