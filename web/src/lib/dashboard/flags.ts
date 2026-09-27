// Dashboard feature flags.
//
// The AI morning brief is OFF by default as of 2026-09-27. Pilot feedback from the
// staff member who actually processes the claims: the brief at the top of the
// dashboard is not useful for her workflow, which is intake → generate the
// accident-notice form → send it to the insurer. She asked for a simpler screen
// with the most recently opened claim first.
//
// The brief code (`web/src/lib/brief/`) is kept intact rather than deleted, because
// it is the artifact to put in front of the agent in the post-intake validation
// session that tests V6 (docs/assumptions-canvas.md). Set BRIEF_ENABLED=1 to bring
// back the ranked three-section view.
//
// Server-only (no NEXT_PUBLIC_): the dashboard is a server component and passes the
// resolved value down, so the flag never reaches the client bundle.
export function briefEnabled(): boolean {
  return process.env.BRIEF_ENABLED === "1";
}
