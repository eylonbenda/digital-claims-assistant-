import { EMAIL_COPY as C } from "@/lib/email/copy";
import type { EmailRow } from "@/lib/email/load";
import { HANDLED_NONE, isPendingEmail } from "@/lib/email/pending";
import { HANDLING_LABEL } from "@/lib/handling/copy";
import { isHandlingStatus, type HandlingStatus } from "@/lib/handling/types";
import EmailCard from "../inbox/EmailCard";
import EmailActions from "./EmailActions";

type Props = {
  emails: EmailRow[];
  now: Date;
  claimId: string;
  handlingEffective: HandlingStatus | null;
  claimClosed: boolean;
  demandAmount?: number | null;
  paidSoFar?: number | null;
};

// What was sent to the insurer from the app and what came back, newest first.
// An inbound email on a sent claim carries its own "update the status" row until
// the clerk has dealt with it; afterwards it shows what she decided.
export default function CorrespondencePanel(p: Props) {
  const claim = { handlingEffective: p.handlingEffective, closed: p.claimClosed };
  return (
    <section id="correspondence" className="scroll-mt-4">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">
        {C.correspondenceTitle}
        <span className="mr-1 text-sm font-normal text-zinc-400">({p.emails.length})</span>
      </h2>
      <ul className="space-y-3">
        {p.emails.map((e) => (
          <EmailCard key={e.id} email={e} now={p.now}>
            {isPendingEmail(e, claim) && p.handlingEffective ? (
              <EmailActions
                claimId={p.claimId}
                email={{
                  id: e.id,
                  body: e.text_body,
                  attachments: e.attachments.map(({ id, filename }) => ({ id, filename })),
                }}
                effective={p.handlingEffective}
                demandAmount={p.demandAmount}
                paidSoFar={p.paidSoFar}
              />
            ) : e.direction === "inbound" && e.handled_as ? (
              <p className="text-xs text-muted">
                {e.handled_as === HANDLED_NONE
                  ? C.handledNone
                  : `${C.handledAs} ${isHandlingStatus(e.handled_as) ? HANDLING_LABEL[e.handled_as] : e.handled_as}`}
              </p>
            ) : null}
          </EmailCard>
        ))}
      </ul>
    </section>
  );
}
