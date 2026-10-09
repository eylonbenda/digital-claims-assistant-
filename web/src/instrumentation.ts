import type { Instrumentation } from "next";
import { reportError } from "@/lib/observability/report";

// Uncaught server errors (render, route handlers, proxy). Returned 500s go through
// serverError() at the call site instead. context.routePath is the route *pattern*
// (e.g. /c/[token]) — request.path is deliberately not reported: it carries the
// claimant's access token on /c/* and query strings elsewhere.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  await reportError(context.routePath, err, {
    method: request.method,
    routeType: context.routeType,
    digest: (err as { digest?: string }).digest,
  });
};
