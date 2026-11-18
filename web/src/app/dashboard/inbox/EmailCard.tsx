import { EMAIL_COPY as C, emailTime } from "@/lib/email/copy";
import type { EmailRow } from "@/lib/email/load";

// One stored message. The body is third-party text: rendered as plain text only,
// never as markup. `children` is the row's action (the inbox adds "assign").
export default function EmailCard({
  email,
  now,
  children,
}: {
  email: EmailRow;
  now: Date;
  children?: React.ReactNode;
}) {
  const outbound = email.direction === "outbound";
  const body = email.text_body?.trim() ?? "";
  const long = body.length > 320 || body.split("\n").length > 5;

  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{email.subject || C.noSubject}</span>
            {outbound && (
              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">
                {C.sentByUs}
              </span>
            )}
            {email.delivery_failed && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                {C.deliveryFailed}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {outbound && `${C.to}: `}
            <bdi dir="ltr">{outbound ? email.to_addrs.join(", ") : email.from_addr}</bdi>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted">{emailTime(email.received_at, now)}</span>
      </div>

      {body ? (
        long ? (
          <details className="group mt-3">
            <summary className="cursor-pointer list-none marker:content-none">
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-ink/80 group-open:hidden" dir="auto">
                {body}
              </p>
              <span className="mt-1 inline-block text-xs font-medium text-brand group-open:hidden">
                {C.showMore}
              </span>
            </summary>
            <p className="whitespace-pre-wrap break-words text-sm text-ink/80" dir="auto">
              {body}
            </p>
          </details>
        ) : (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink/80" dir="auto">
            {body}
          </p>
        )
      ) : (
        <p className="mt-3 text-sm text-muted">{C.noBody}</p>
      )}

      {email.attachments_dropped && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {C.attachmentsDropped}
        </p>
      )}

      {email.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {email.attachments.map((a) => (
            <li key={a.id}>
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs text-ink hover:border-brand hover:text-brand"
                >
                  <span aria-hidden="true">📎</span>
                  <span className="truncate" dir="auto">{a.filename || "file"}</span>
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted">
                  <span dir="auto">{a.filename || "file"}</span> · {C.linkUnavailable}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {children && <div className="mt-3 border-t border-line pt-3">{children}</div>}
    </li>
  );
}
