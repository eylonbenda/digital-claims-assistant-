import { EMAIL_COPY as C } from "@/lib/email/copy";
import type { EmailRow } from "@/lib/email/load";
import EmailCard from "../inbox/EmailCard";

// What was sent to the insurer from the app and what came back, newest first.
export default function CorrespondencePanel({ emails, now }: { emails: EmailRow[]; now: Date }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">
        {C.correspondenceTitle}
        <span className="mr-1 text-sm font-normal text-zinc-400">({emails.length})</span>
      </h2>
      <ul className="space-y-3">
        {emails.map((e) => (
          <EmailCard key={e.id} email={e} now={now} />
        ))}
      </ul>
    </section>
  );
}
