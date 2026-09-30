// Shared rules for the claimant's submit path (submit route, draft route, /c/[token]).

// Once a claim reaches any of these, the claimant's collected data is authoritative:
// submit answers "already submitted", drafts are refused, the link shows the done screen.
export const SUBMITTED_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "classified",
  "form_generated",
  "checklist_active",
  "closed",
]);

// Machine-readable 409 code. The wizard treats it as success: a retry after a lost
// response (or a double tap) must land on the done screen, not on an error.
export const ALREADY_SUBMITTED = "already_submitted";

export type SubmitBody = { token: string; collected: Record<string, unknown> };

export function parseSubmitBody(body: unknown): SubmitBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { token, collected } = body as { token?: unknown; collected?: unknown };
  if (typeof token !== "string" || !token) return null;
  if (typeof collected !== "object" || collected === null || Array.isArray(collected)) {
    return null;
  }
  return { token, collected: collected as Record<string, unknown> };
}

export function isAlreadySubmitted(status: number, json: unknown): boolean {
  return status === 409 && (json as { code?: unknown } | null)?.code === ALREADY_SUBMITTED;
}
